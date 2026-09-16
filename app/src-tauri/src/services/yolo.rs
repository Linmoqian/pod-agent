// 常驻 ONNX 推理服务：本机鉴权、会话复用与分类计数。
// Created on 2026-09-15
// @author: https://github.com/Linmoqian

use image::{imageops, Rgb, RgbImage};
use ort::{session::Session, value::Tensor};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    sync::{mpsc, Arc, Mutex, OnceLock},
    sync::atomic::{AtomicUsize, Ordering},
    time::{Instant, SystemTime, UNIX_EPOCH},
};
#[cfg(target_os = "macos")]
use std::{ffi::CString, os::raw::c_char, slice};
use tauri::{AppHandle, Manager};

static ENDPOINT: OnceLock<Result<(String, String), String>> = OnceLock::new();
static CACHE: Mutex<Option<(String, Session)>> = Mutex::new(None);
static BATCH_CACHE: Mutex<Option<(String, Vec<Session>)>> = Mutex::new(None);
static BATCH_SUPPORT_CACHE: Mutex<Option<(String, bool)>> = Mutex::new(None);
static PERF_LOG: OnceLock<Mutex<Option<std::fs::File>>> = OnceLock::new();
const MAX_BATCH_IMAGES: usize = 64;
const PREP_QUEUE_CAPACITY: usize = 4;
const MAX_PREP_WORKERS: usize = 4;

fn perf_log(message: impl AsRef<str>) {
    let Some(path) = std::env::var_os("LIAN_YOLO_PERF_LOG") else {
        return;
    };
    let logger = PERF_LOG.get_or_init(|| {
        Mutex::new(
            OpenOptions::new()
                .create(true)
                .append(true)
                .open(path)
                .ok(),
        )
    });
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or_default();
    if let Ok(mut file) = logger.lock() {
        if let Some(file) = file.as_mut() {
            let _ = writeln!(file, "{timestamp}\t{}", message.as_ref());
            let _ = file.flush();
        }
    }
}

fn folder_images(root: &Path) -> Result<Vec<String>, String> {
    if !root.is_absolute() || !root.is_dir() { return Err("请选择有效的图片文件夹".into()); }
    let mut pending = vec![root.to_path_buf()];
    let mut images = Vec::new();
    while let Some(directory) = pending.pop() {
        for entry in std::fs::read_dir(directory).map_err(|_| "文件夹不可读")? {
            let entry = entry.map_err(|_| "文件夹条目不可读")?;
            let kind = entry.file_type().map_err(|_| "文件类型不可读")?;
            let path = entry.path();
            if kind.is_dir() { pending.push(path); }
            else if kind.is_file() && path.extension().and_then(|ext| ext.to_str())
                .is_some_and(|ext| matches!(ext.to_ascii_lowercase().as_str(), "jpg" | "jpeg" | "png")) {
                images.push(path.to_string_lossy().into_owned());
            }
        }
    }
    images.sort();
    Ok(images)
}

#[tauri::command]
pub async fn yolo_folder_images(folder_path: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || folder_images(Path::new(&folder_path)))
        .await.map_err(|_| "文件夹扫描中断".to_string())?
}

#[tauri::command]
pub async fn yolo_drop_images(paths: Vec<String>) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut images = std::collections::BTreeSet::new();
        for path in paths {
            let path = Path::new(&path);
            if !path.is_absolute() { return Err("图片路径必须为绝对路径".to_string()); }
            let metadata = std::fs::symlink_metadata(path).map_err(|_| "拖入的路径不可读")?;
            if metadata.file_type().is_symlink() { continue; }
            if metadata.is_dir() { images.extend(folder_images(path)?); }
            else if metadata.is_file() && path.extension().and_then(|ext| ext.to_str())
                .is_some_and(|ext| matches!(ext.to_ascii_lowercase().as_str(), "jpg" | "jpeg" | "png")) {
                images.insert(path.to_string_lossy().into_owned());
            }
        }
        Ok(images.into_iter().collect())
    }).await.map_err(|_| "拖放扫描中断".to_string())?
}

#[tauri::command]
pub async fn yolo_detect_image(model_id: String, image_path: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().parent().unwrap();
        let mut cache = CACHE.lock().map_err(|_| "推理服务不可用")?;
        infer(root, Request { model_id, image_path, target_class: None, min_confidence: 0.25 }, &mut cache)
    }).await.map_err(|_| "推理任务中断".to_string())?
}

#[tauri::command]
pub async fn yolo_detect_images(model_id: String, image_paths: Vec<String>) -> Result<Vec<Value>, String> {
    if image_paths.len() > MAX_BATCH_IMAGES {
        return Err(format!("单批最多处理 {MAX_BATCH_IMAGES} 张图片"));
    }
    if image_paths.is_empty() {
        return Ok(Vec::new());
    }
    let started = Instant::now();
    let results = tauri::async_runtime::spawn_blocking(move || {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().parent().unwrap();
        infer_batch(root, &model_id, &image_paths, None, 0.25)
    }).await.map_err(|_| "批量推理任务中断".to_string())??;
    perf_log(format!(
        "command.batch images={} total_ms={}",
        results.len(),
        started.elapsed().as_secs_f64() * 1000.,
    ));
    Ok(results)
}

#[tauri::command]
pub async fn yolo_result_preview(image_path: String, detections: Vec<PreviewDetection>) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        annotated_thumbnail(Path::new(&image_path), &detections)
    }).await.map_err(|_| "结果预览任务中断".to_string())?
}

#[tauri::command]
pub async fn yolo_image_preview(image_path: String) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        image_preview(Path::new(&image_path))
    }).await.map_err(|_| "原图预览任务中断".to_string())?
}

#[tauri::command]
pub fn yolo_prepare_image_preview(app: AppHandle, image_path: String) -> Result<(), String> {
    let path = Path::new(&image_path);
    if !path.is_absolute() {
        return Err("图片路径必须为绝对路径".to_string());
    }
    let metadata = std::fs::symlink_metadata(path).map_err(|_| "图片不可读".to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("图片文件不可用".to_string());
    }
    if !path
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| {
            matches!(ext.to_ascii_lowercase().as_str(), "jpg" | "jpeg" | "png")
        })
    {
        return Err("暂不支持该图片格式".to_string());
    }
    let canonical_path = path.canonicalize().map_err(|_| "图片不可读".to_string())?;
    app.asset_protocol_scope()
        .allow_file(canonical_path)
        .map_err(|_| "原图预览权限不可用".to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRow {
    name: String,
    path: String,
    model: String,
    status: String,
    count: Option<usize>,
    counts: BTreeMap<String, usize>,
    summary: String,
}

#[tauri::command]
pub async fn yolo_export_csv(output_path: String, rows: Vec<ExportRow>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(output_path);
        if !path.is_absolute() || path.extension().and_then(|value| value.to_str()) != Some("csv") {
            return Err("请保存为绝对路径的 CSV 文件".to_string());
        }
        let mut writer = csv::WriterBuilder::new()
            .from_path(path)
            .map_err(|_| "CSV 文件无法写入")?;
        writer.write_record(["图片名称", "图片路径", "模型", "状态", "对象总数", "类别计数", "推理摘要"])
            .map_err(|_| "CSV 表头写入失败")?;
        for row in rows {
            let counts = row.counts.iter()
                .map(|(name, count)| format!("{name}:{count}"))
                .collect::<Vec<_>>()
                .join("; ");
            writer.write_record([
                row.name,
                row.path,
                row.model,
                row.status,
                row.count.map(|value| value.to_string()).unwrap_or_default(),
                counts,
                row.summary,
            ]).map_err(|_| "CSV 记录写入失败")?;
        }
        writer.flush().map_err(|_| "CSV 保存失败".to_string())
    }).await.map_err(|_| "CSV 导出任务中断".to_string())?
}

#[tauri::command]
pub fn yolo_models() -> Result<Value, String> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().parent().unwrap();
    let entries: Vec<Value> = serde_json::from_slice(&std::fs::read(root.join("app/agent/tools/yolo-models.json")).map_err(|_| "模型清单不可读")?).map_err(|_| "模型清单无效")?;
    Ok(Value::Array(entries.into_iter().map(|entry| {
        let primary_available = entry["onnxPath"].as_str().is_some_and(|path| root.join(path).is_file());
        let apple_available = entry["appleOnnxPath"].as_str().is_some_and(|path| root.join(path).is_file());
        let apple_batch8_available = entry["appleBatch8OnnxPath"].as_str().is_some_and(|path| root.join(path).is_file());
        let available = if cfg!(target_vendor = "apple") {
            primary_available || apple_available || apple_batch8_available
        } else {
            primary_available
        };
        json!({"id":entry["id"], "name":entry["name"], "available":available})
    }).collect()))
}

fn system_memory_gb() -> Result<f64, String> {
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("/usr/sbin/sysctl")
            .args(["-n", "hw.memsize"])
            .output()
            .map_err(|_| "系统内存不可读".to_string())?;
        let bytes = String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse::<u64>()
            .map_err(|_| "系统内存格式无效".to_string())?;
        return Ok(bytes as f64 / 1024_f64.powi(3));
    }
    #[cfg(target_os = "linux")]
    {
        let contents = std::fs::read_to_string("/proc/meminfo").map_err(|_| "系统内存不可读".to_string())?;
        let kib = contents
            .lines()
            .find_map(|line| line.strip_prefix("MemTotal:")?.split_whitespace().next()?.parse::<u64>().ok())
            .ok_or_else(|| "系统内存格式无效".to_string())?;
        return Ok(kib as f64 / 1024_f64.powi(2));
    }
    #[allow(unreachable_code)]
    Err("当前平台不提供系统内存信息".to_string())
}

#[tauri::command]
pub async fn yolo_memory_gb() -> Result<f64, String> {
    tauri::async_runtime::spawn_blocking(system_memory_gb)
        .await.map_err(|_| "系统内存查询中断".to_string())?
}

#[tauri::command]
pub async fn yolo_thumbnail(image_path: String) -> Result<Vec<u8>, String> {
    let started = Instant::now();
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        thumbnail(Path::new(&image_path))
    }).await.map_err(|_| "缩略图任务中断".to_string())??;
    perf_log(format!(
        "thumbnail bytes={} total_ms={}",
        bytes.len(),
        started.elapsed().as_secs_f64() * 1000.,
    ));
    Ok(bytes)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    model_id: String,
    image_path: String,
    target_class: Option<String>,
    min_confidence: f32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchRequest {
    model_id: String,
    image_paths: Vec<String>,
    target_class: Option<String>,
    min_confidence: f32,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Model {
    id: String,
    onnx_path: Option<String>,
    apple_onnx_path: Option<String>,
    apple_batch8_onnx_path: Option<String>,
    classes: Option<Vec<String>>,
    input_size: Option<u32>,
}

struct ModelConfig {
    path: PathBuf,
    classes: Vec<String>,
    size: u32,
    supports_dynamic_batch: bool,
    fixed_batch_size: Option<usize>,
    cache_key: String,
}

struct PreparedImage {
    width: u32,
    height: u32,
    resized_width: u32,
    resized_height: u32,
    ratio: f32,
    input: Vec<f32>,
}

#[derive(Clone)]
struct Detection { class: usize, score: f32, rect: [f32; 4] }

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewDetection {
    class_name: String,
    score: f32,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

fn iou(a: &[f32; 4], b: &[f32; 4]) -> f32 {
    let area = |r: &[f32; 4]| (r[2] - r[0]).max(0.) * (r[3] - r[1]).max(0.);
    let intersection = (a[2].min(b[2]) - a[0].max(b[0])).max(0.)
        * (a[3].min(b[3]) - a[1].max(b[1])).max(0.);
    intersection / (area(a) + area(b) - intersection).max(f32::EPSILON)
}

fn decode(data: &[f32], channels: usize, anchors: usize, threshold: f32) -> Vec<Detection> {
    let mut candidates = Vec::new();
    for i in 0..anchors {
        let (class, score) = (4..channels).map(|c| (c - 4, data[c * anchors + i]))
            .max_by(|a, b| a.1.total_cmp(&b.1)).unwrap();
        let (x, y, w, h) = (data[i], data[anchors + i], data[2 * anchors + i], data[3 * anchors + i]);
        if score.is_finite() && score >= threshold && score <= 1.
            && [x, y, w, h].iter().all(|v| v.is_finite()) && w > 0. && h > 0. {
            candidates.push(Detection { class, score, rect: [x-w/2., y-h/2., x+w/2., y+h/2.] });
        }
    }
    candidates.sort_by(|a, b| b.score.total_cmp(&a.score));
    candidates.truncate(30_000);
    let mut kept: Vec<Detection> = Vec::new();
    for candidate in candidates {
        if kept.iter().all(|other| other.class != candidate.class || iou(&other.rect, &candidate.rect) <= 0.45) {
            kept.push(candidate);
            if kept.len() == 300 { break; }
        }
    }
    kept
}

fn load_model(root: &Path, model_id: &str, target_class: Option<&str>) -> Result<ModelConfig, String> {
    let models: Vec<Model> = serde_json::from_slice(
        &std::fs::read(root.join("app/agent/tools/yolo-models.json"))
            .map_err(|_| "模型清单不可读")?,
    ).map_err(|_| "模型清单无效")?;
    let model = models.into_iter().find(|model| model.id == model_id).ok_or("未知模型")?;
    let primary_path = root.join(model.onnx_path.ok_or("该模型未登记 ONNX 权重")?);
    #[cfg(target_vendor = "apple")]
    let (path, supports_dynamic_batch, fixed_batch_size) = {
        let batch8_path = model.apple_batch8_onnx_path.as_deref()
            .map(|value| root.join(value))
            .filter(|path| path.is_file());
        let batch1_path = model.apple_onnx_path.as_deref()
            .map(|value| root.join(value))
            .filter(|path| path.is_file());
        batch1_path.map(|path| (path, false, Some(1)))
            .or_else(|| batch8_path.map(|path| (path, false, Some(8))))
            .unwrap_or((primary_path, true, None))
    };
    #[cfg(not(target_vendor = "apple"))]
    let (path, supports_dynamic_batch, fixed_batch_size) = (primary_path, true, None);
    let classes = model.classes.ok_or("缺少有序类别清单")?;
    let size = model.input_size.ok_or("缺少输入尺寸")?;
    if classes.is_empty() || !(32..=2048).contains(&size) {
        return Err("模型配置无效".into());
    }
    if target_class.is_some_and(|target| !classes.iter().any(|class| class == target)) {
        return Err("指定模型不支持该类别".into());
    }
    let metadata = std::fs::metadata(&path).map_err(|_| "ONNX 权重不存在")?;
    let cache_key = format!("{}:{:?}:{}", path.display(), metadata.modified().ok(), metadata.len());
    Ok(ModelConfig { path, classes, size, supports_dynamic_batch, fixed_batch_size, cache_key })
}

fn prepare_image(image_path: &str, size: u32) -> Result<PreparedImage, String> {
    if !Path::new(image_path).is_absolute() {
        return Err("图片必须为绝对路径".into());
    }
    let reader = image::ImageReader::open(image_path).map_err(|_| "图片不可读")?
        .with_guessed_format().map_err(|_| "图片格式无效")?;
    let image = reader.decode().map_err(|_| "图片解码失败或超过资源限制")?.to_rgb8();
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        return Err("图片尺寸无效".into());
    }
    let ratio = (size as f64 / width as f64).min(size as f64 / height as f64);
    let resized_width = (width as f64 * ratio).round().max(1.) as u32;
    let resized_height = (height as f64 * ratio).round().max(1.) as u32;
    let mut padded = RgbImage::from_pixel(size, size, Rgb([114, 114, 114]));
    let resized = imageops::resize(
        &image,
        resized_width,
        resized_height,
        imageops::FilterType::Triangle,
    );
    imageops::replace(
        &mut padded,
        &resized,
        ((size - resized_width) / 2) as i64,
        ((size - resized_height) / 2) as i64,
    );
    let plane = (size as usize) * (size as usize);
    let mut input = vec![0_f32; plane * 3];
    for (index, pixel) in padded.pixels().enumerate() {
        for channel in 0..3 {
            input[channel * plane + index] = pixel[channel] as f32 / 255.;
        }
    }
    Ok(PreparedImage {
        width,
        height,
        resized_width,
        resized_height,
        ratio: ratio as f32,
        input,
    })
}

fn thumbnail(path: &Path) -> Result<Vec<u8>, String> {
    if !path.is_absolute() {
        return Err("图片必须为绝对路径".into());
    }
    #[cfg(target_os = "macos")]
    if let Some(bytes) = quicklook_thumbnail(path) {
        return Ok(bytes);
    }
    image_thumbnail(path)
}

#[cfg(target_os = "macos")]
fn quicklook_thumbnail(path: &Path) -> Option<Vec<u8>> {
    let path = CString::new(path.to_string_lossy().as_bytes()).ok()?;
    let mut bytes = std::ptr::null_mut();
    let mut length = 0;
    let generated = unsafe {
        if lian_quicklook_thumbnail(path.as_ptr(), &mut bytes, &mut length) == 0 {
            return None;
        }
        if bytes.is_null() || length == 0 {
            lian_quicklook_thumbnail_free(bytes);
            return None;
        }
        let result = slice::from_raw_parts(bytes, length).to_vec();
        lian_quicklook_thumbnail_free(bytes);
        result
    };
    if generated.is_empty() {
        return None;
    }
    Some(generated)
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn lian_quicklook_thumbnail(
        path: *const c_char,
        bytes: *mut *mut u8,
        length: *mut usize,
    ) -> i32;
    fn lian_quicklook_thumbnail_free(bytes: *mut u8);
}

fn image_thumbnail(path: &Path) -> Result<Vec<u8>, String> {
    let image = image::ImageReader::open(path).map_err(|_| "图片不可读")?
        .decode().map_err(|_| "图片解码失败")?;
    let mut bytes = std::io::Cursor::new(Vec::new());
    image.thumbnail(240, 180).write_to(&mut bytes, image::ImageFormat::Png)
        .map_err(|_| "缩略图失败")?;
    Ok(bytes.into_inner())
}

fn inference_thread_count() -> usize {
    std::thread::available_parallelism()
        .map(|parallelism| parallelism.get().clamp(2, 8))
        .unwrap_or(2)
}

fn batch_session_count() -> usize {
    std::thread::available_parallelism()
        .map(|parallelism| if parallelism.get() >= 4 { 2 } else { 1 })
        .unwrap_or(1)
}

fn build_session(path: &Path, intra_threads: usize) -> Result<Session, String> {
    let mut builder = Session::builder().map_err(|_| "ONNX Runtime 初始化失败")?;
    #[cfg(target_vendor = "apple")]
    {
        builder = builder
            .with_execution_providers([
                ort::execution_providers::CoreMLExecutionProvider::default()
                    .with_compute_units(ort::execution_providers::coreml::CoreMLComputeUnits::All)
                    .with_low_precision_accumulation_on_gpu(true)
                    .with_specialization_strategy(ort::execution_providers::coreml::CoreMLSpecializationStrategy::FastPrediction)
                    .build(),
            ])
            .map_err(|_| "CoreML 执行后端初始化失败")?;
    }
    #[cfg(all(
        feature = "tensorrt",
        any(target_os = "linux", target_os = "windows"),
        any(target_arch = "x86_64", target_arch = "aarch64")
    ))]
    {
        builder = builder
            .with_execution_providers([
                ort::execution_providers::TensorRTExecutionProvider::default()
                    .with_fp16(true)
                    .with_min_subgraph_size(5)
                    .with_profile_min_shapes("images:1x3x640x640")
                    .with_profile_opt_shapes("images:16x3x640x640")
                    .with_profile_max_shapes("images:64x3x640x640")
                    .build(),
                ort::execution_providers::CUDAExecutionProvider::default()
                    .with_conv_algorithm_search(ort::execution_providers::CuDNNConvAlgorithmSearch::Heuristic)
                    .with_tf32(true)
                    .with_prefer_nhwc(true)
                    .build(),
            ])
            .map_err(|_| "TensorRT/CUDA 执行后端初始化失败")?;
    }
    #[cfg(all(
        feature = "cuda",
        not(feature = "tensorrt"),
        any(target_os = "linux", target_os = "windows"),
        any(target_arch = "x86_64", target_arch = "aarch64")
    ))]
    {
        builder = builder
            .with_execution_providers([
                ort::execution_providers::CUDAExecutionProvider::default()
                    .with_conv_algorithm_search(ort::execution_providers::CuDNNConvAlgorithmSearch::Heuristic)
                    .with_tf32(true)
                    .with_prefer_nhwc(true)
                    .build(),
            ])
            .map_err(|_| "CUDA 执行后端初始化失败")?;
    }
    builder
        .with_intra_threads(intra_threads).map_err(|_| "线程配置失败")?
        .commit_from_file(path).map_err(|_| "ONNX 模型加载失败".into())
}

fn ensure_session(model: &ModelConfig, cache: &mut Option<(String, Session)>) -> Result<bool, String> {
    let reused = cache.as_ref().is_some_and(|(key, _)| key == &model.cache_key);
    if !reused {
        let started = Instant::now();
        let session = build_session(&model.path, inference_thread_count())?;
        *cache = Some((model.cache_key.clone(), session));
        perf_log(format!(
            "session.create mode=single threads={} elapsed_ms={}",
            inference_thread_count(),
            started.elapsed().as_secs_f64() * 1000.,
        ));
    }
    perf_log(format!("session.single reused={reused}"));
    Ok(reused)
}

fn take_batch_sessions(model: &ModelConfig, requested: usize) -> Result<(bool, Vec<Session>), String> {
    let mut cache = BATCH_CACHE.lock().map_err(|_| "推理服务不可用")?;
    let reused = cache.as_ref().is_some_and(|(key, sessions)| {
        key == &model.cache_key && sessions.len() >= requested
    });
    if !reused {
        let started = Instant::now();
        let sessions = (0..requested)
            .map(|_| build_session(&model.path, if requested > 1 { 1 } else { inference_thread_count() }))
            .collect::<Result<Vec<_>, _>>()?;
        *cache = Some((model.cache_key.clone(), sessions));
        perf_log(format!(
            "session.create mode=batch_parallel count={} elapsed_ms={}",
            requested,
            started.elapsed().as_secs_f64() * 1000.,
        ));
    }
    let sessions = cache.as_mut().ok_or("推理服务不可用")?.1.drain(..).collect();
    perf_log(format!("session.batch requested={} reused={reused}", requested));
    Ok((reused, sessions))
}

fn return_batch_sessions(model: &ModelConfig, mut sessions: Vec<Session>) {
    if let Ok(mut cache) = BATCH_CACHE.lock() {
        if let Some((key, cached)) = cache.as_mut() {
            if key == &model.cache_key {
                cached.append(&mut sessions);
                return;
            }
        }
        *cache = Some((model.cache_key.clone(), sessions));
    }
}

fn take_batch_session(model: &ModelConfig) -> Result<(bool, Session), String> {
    let mut cache = BATCH_CACHE.lock().map_err(|_| "推理服务不可用")?;
    let reused = cache.as_ref().is_some_and(|(key, sessions)| {
        key == &model.cache_key && !sessions.is_empty()
    });
    if !reused {
        let session = build_session(&model.path, inference_thread_count())?;
        *cache = Some((model.cache_key.clone(), vec![session]));
    }
    let session = cache
        .as_mut()
        .and_then(|(_, sessions)| sessions.pop())
        .ok_or("推理服务不可用")?;
    Ok((reused, session))
}

fn batch_support(model: &ModelConfig) -> Option<bool> {
    BATCH_SUPPORT_CACHE.lock().ok().and_then(|cache| {
        cache.as_ref().and_then(|(key, supported)| {
            (key == &model.cache_key).then_some(*supported)
        })
    })
}

fn remember_batch_support(model: &ModelConfig, supported: bool) {
    if let Ok(mut cache) = BATCH_SUPPORT_CACHE.lock() {
        *cache = Some((model.cache_key.clone(), supported));
    }
}

fn error_result(message: String) -> Value {
    json!({ "ok": false, "message": message })
}

fn merge_results(
    prepared: Vec<Result<PreparedImage, String>>,
    batch_results: Vec<(usize, Value)>,
) -> Vec<Value> {
    let mut results = prepared.into_iter().map(|result| match result {
        Ok(_) => Value::Null,
        Err(message) => error_result(message),
    }).collect::<Vec<_>>();
    for (index, result) in batch_results {
        results[index] = result;
    }
    results
}

fn result_from_output(
    model: &ModelConfig,
    prepared: &PreparedImage,
    data: &[f32],
    channels: usize,
    anchors: usize,
    target_class: Option<&str>,
    min_confidence: f32,
    session_reused: bool,
) -> Value {
    let detections = decode(data, channels, anchors, min_confidence);
    let mut counts = BTreeMap::<String, usize>::new();
    let mut preview_detections = Vec::new();
    if let Some(target) = target_class {
        counts.insert(target.to_string(), 0);
    }
    let size = model.size;
    let pad_x = (size - prepared.resized_width) as f32 / 2.;
    let pad_y = (size - prepared.resized_height) as f32 / 2.;
    for detection in detections {
        let name = &model.classes[detection.class];
        if target_class.is_none_or(|target| target == name) {
            *counts.entry(name.clone()).or_default() += 1;
            let left = ((detection.rect[0] - pad_x) / prepared.ratio)
                .clamp(0., prepared.width as f32);
            let top = ((detection.rect[1] - pad_y) / prepared.ratio)
                .clamp(0., prepared.height as f32);
            let right = ((detection.rect[2] - pad_x) / prepared.ratio)
                .clamp(left, prepared.width as f32);
            let bottom = ((detection.rect[3] - pad_y) / prepared.ratio)
                .clamp(top, prepared.height as f32);
            preview_detections.push(PreviewDetection {
                class_name: name.clone(),
                score: detection.score,
                x: left.round() as u32,
                y: top.round() as u32,
                width: (right - left).round() as u32,
                height: (bottom - top).round() as u32,
            });
        }
    }
    let count: usize = counts.values().sum();
    let message = if counts.is_empty() {
        "未检测到达到阈值的对象".into()
    } else {
        format!(
            "这张照片检测到{}",
            counts.iter()
                .map(|(name, count)| format!("{name} {count} 个"))
                .collect::<Vec<_>>()
                .join("、"),
        )
    };
    json!({
        "ok": true,
        "count": count,
        "counts": counts,
        "detections": preview_detections,
        "message": message,
        "sessionReused": session_reused
    })
}

fn infer_prepared(
    model: &ModelConfig,
    mut prepared: PreparedImage,
    target_class: Option<&str>,
    min_confidence: f32,
    session: &mut Session,
    session_reused: bool,
) -> Result<Value, String> {
    let size = model.size;
    let input = std::mem::take(&mut prepared.input);
    let tensor = Tensor::from_array(([1, 3, size as usize, size as usize], input))
        .map_err(|_| "输入张量失败")?;
    let started = Instant::now();
    let output = session.run(ort::inputs![tensor]).map_err(|error| {
        perf_log(format!("infer.session_run_failed mode=single error={error:?}"));
        "ONNX 推理失败"
    })?;
    perf_log(format!(
        "infer.session_run mode=single images=1 elapsed_ms={}",
        started.elapsed().as_secs_f64() * 1000.,
    ));
    let (shape, data) = output[0].try_extract_tensor::<f32>().map_err(|_| "输出类型不支持")?;
    if shape.len() != 3 || shape[0] != 1 || shape[1] != (model.classes.len() + 4) as i64 || shape[2] <= 0 {
        return Err("仅支持 YOLOv8 detect 原始输出 [1,4+类别数,N]，请使用 nms=False 导出".into());
    }
    Ok(result_from_output(
        model,
        &prepared,
        data,
        shape[1] as usize,
        shape[2] as usize,
        target_class,
        min_confidence,
        session_reused,
    ))
}

fn infer(root: &Path, request: Request, cache: &mut Option<(String, Session)>) -> Result<Value, String> {
    if !request.min_confidence.is_finite() || !(0.0..=1.0).contains(&request.min_confidence) {
        return Err("置信度无效".into());
    }
    let model = load_model(root, &request.model_id, request.target_class.as_deref())?;
    let prepared = prepare_image(&request.image_path, model.size)?;
    if let Some(batch_size) = model.fixed_batch_size.filter(|size| *size > 1) {
        let prepared = [(0, &prepared)];
        return infer_prepared_fixed_batch(
            &model,
            &prepared,
            request.target_class.as_deref(),
            request.min_confidence,
            batch_size,
        )?.into_iter().next()
            .map(|(_, result)| result)
            .ok_or_else(|| "固定 Batch 推理没有返回结果".into());
    }
    let session_reused = ensure_session(&model, cache)?;
    let session = &mut cache.as_mut().ok_or("推理服务不可用")?.1;
    infer_prepared(
        &model,
        prepared,
        request.target_class.as_deref(),
        request.min_confidence,
        session,
        session_reused,
    )
}

fn prepare_images(image_paths: &[String], size: u32) -> Vec<Result<PreparedImage, String>> {
    let worker_count = image_paths.len()
        .min(MAX_PREP_WORKERS)
        .min(std::thread::available_parallelism().map(|value| value.get()).unwrap_or(1).max(1));
    let next_index = AtomicUsize::new(0);
    let (sender, receiver) = mpsc::sync_channel(PREP_QUEUE_CAPACITY);
    let mut prepared = (0..image_paths.len())
        .map(|_| None)
        .collect::<Vec<Option<Result<PreparedImage, String>>>>();

    std::thread::scope(|scope| {
        for _ in 0..worker_count {
            let sender = sender.clone();
            let next_index = &next_index;
            scope.spawn(move || loop {
                let index = next_index.fetch_add(1, Ordering::Relaxed);
                if index >= image_paths.len() {
                    break;
                }
                let result = prepare_image(&image_paths[index], size);
                if sender.send((index, result)).is_err() {
                    break;
                }
            });
        }
        drop(sender);
        for (index, result) in receiver {
            prepared[index] = Some(result);
        }
    });

    prepared.into_iter()
        .map(|result| result.unwrap_or_else(|| Err("图片预处理任务中断".into())))
        .collect()
}

fn infer_prepared_batch(
    model: &ModelConfig,
    prepared: &[(usize, &PreparedImage)],
    target_class: Option<&str>,
    min_confidence: f32,
    session: &mut Session,
    session_reused: bool,
) -> Result<Vec<(usize, Value)>, String> {
    let size = model.size as usize;
    let image_input_len = 3 * size * size;
    let mut input = Vec::with_capacity(image_input_len * prepared.len());
    for (_, image) in prepared {
        if image.input.len() != image_input_len {
            return Err("输入图片尺寸不一致".into());
        }
        input.extend_from_slice(&image.input);
    }
    let tensor = Tensor::from_array(([prepared.len(), 3, size, size], input))
        .map_err(|_| "批量输入张量失败")?;
    let started = Instant::now();
    let output = session.run(ort::inputs![tensor]).map_err(|error| {
        perf_log(format!(
            "infer.session_run_failed mode=batch images={} error={error:?}",
            prepared.len(),
        ));
        "ONNX 批量推理失败"
    })?;
    perf_log(format!(
        "infer.session_run mode=batch images={} elapsed_ms={}",
        prepared.len(),
        started.elapsed().as_secs_f64() * 1000.,
    ));
    let (shape, data) = output[0].try_extract_tensor::<f32>().map_err(|_| "输出类型不支持")?;
    if shape.len() != 3
        || shape[0] != prepared.len() as i64
        || shape[1] != (model.classes.len() + 4) as i64
        || shape[2] <= 0
    {
        return Err("模型 Batch 或输出形状不匹配，请使用 nms=False 导出".into());
    }
    let channels = shape[1] as usize;
    let anchors = shape[2] as usize;
    let image_output_len = channels.checked_mul(anchors).ok_or("输出尺寸无效")?;
    if data.len() < image_output_len * prepared.len() {
        return Err("批量输出数据不完整".into());
    }
    let started = Instant::now();
    let results = prepared.iter().enumerate().map(|(batch_index, (index, image))| {
        let start = batch_index * image_output_len;
        (*index, result_from_output(
            model,
            image,
            &data[start..start + image_output_len],
            channels,
            anchors,
            target_class,
            min_confidence,
            session_reused,
        ))
    }).collect();
    perf_log(format!(
        "infer.postprocess mode=batch images={} elapsed_ms={}",
        prepared.len(),
        started.elapsed().as_secs_f64() * 1000.,
    ));
    Ok(results)
}

fn infer_prepared_fixed_batch(
    model: &ModelConfig,
    prepared: &[(usize, &PreparedImage)],
    target_class: Option<&str>,
    min_confidence: f32,
    fixed_batch_size: usize,
) -> Result<Vec<(usize, Value)>, String> {
    if fixed_batch_size < 2 {
        return Err("固定 Batch 大小无效".into());
    }
    if prepared.is_empty() {
        return Ok(Vec::new());
    }
    let started = Instant::now();
    let (session_reused, mut session) = take_batch_session(model)?;
    let result = (|| {
        let mut results = Vec::with_capacity(prepared.len());
        for (batch_index, chunk) in prepared.chunks(fixed_batch_size).enumerate() {
            let actual_len = chunk.len();
            let last = *chunk.last().ok_or("固定 Batch 尾批为空")?;
            let mut padded = chunk.to_vec();
            padded.resize(fixed_batch_size, last);
            let chunk_results = infer_prepared_batch(
                model,
                &padded,
                target_class,
                min_confidence,
                &mut session,
                session_reused,
            )?;
            results.extend(chunk_results.into_iter().take(actual_len));
            perf_log(format!(
                "infer.fixed_chunk index={} requested={} padded={} batch_size={}",
                batch_index + 1,
                actual_len,
                padded.len(),
                fixed_batch_size,
            ));
        }
        Ok(results)
    })();
    return_batch_sessions(model, vec![session]);
    perf_log(format!(
        "infer.fixed_batch images={} batch_size={} reused={} elapsed_ms={}",
        prepared.len(),
        fixed_batch_size,
        session_reused,
        started.elapsed().as_secs_f64() * 1000.,
    ));
    result
}

fn infer_prepared_parallel(
    model: &ModelConfig,
    prepared: Vec<Result<PreparedImage, String>>,
    target_class: Option<&str>,
    min_confidence: f32,
) -> Result<Vec<Value>, String> {
    let started = Instant::now();
    let requested_sessions = prepared.len().min(batch_session_count()).max(1);
    let (session_reused, sessions) = take_batch_sessions(model, requested_sessions)?;
    let (sender, receiver) = mpsc::sync_channel(PREP_QUEUE_CAPACITY);
    let (result_sender, result_receiver) = mpsc::channel();
    let prepared_receiver = Arc::new(Mutex::new(receiver));
    let returned_sessions = Arc::new(Mutex::new(Vec::with_capacity(sessions.len())));
    let mut results = vec![Value::Null; prepared.len()];

    std::thread::scope(|scope| {
        for mut session in sessions {
            let prepared_receiver = Arc::clone(&prepared_receiver);
            let result_sender = result_sender.clone();
            let returned_sessions = Arc::clone(&returned_sessions);
            scope.spawn(move || {
                loop {
                    let job = match prepared_receiver.lock() {
                        Ok(receiver) => receiver.recv(),
                        Err(_) => break,
                    };
                    let Ok((index, prepared)) = job else { break; };
                    let result = match prepared {
                        Ok(prepared) => infer_prepared(
                            model,
                            prepared,
                            target_class,
                            min_confidence,
                            &mut session,
                            session_reused,
                        ).unwrap_or_else(error_result),
                        Err(message) => error_result(message),
                    };
                    if result_sender.send((index, result)).is_err() {
                        break;
                    }
                }
                if let Ok(mut sessions) = returned_sessions.lock() {
                    sessions.push(session);
                }
            });
        }
        drop(result_sender);
        for (index, prepared) in prepared.into_iter().enumerate() {
            if sender.send((index, prepared)).is_err() {
                break;
            }
        }
        drop(sender);
        for (index, result) in result_receiver {
            results[index] = result;
        }
    });
    let sessions = returned_sessions
        .lock()
        .map(|mut sessions| std::mem::take(&mut *sessions))
        .unwrap_or_default();
    return_batch_sessions(model, sessions);
    perf_log(format!(
        "infer.parallel images={} sessions={} reused={} elapsed_ms={}",
        results.len(),
        requested_sessions,
        session_reused,
        started.elapsed().as_secs_f64() * 1000.,
    ));
    Ok(results)
}

fn infer_batch(
    root: &Path,
    model_id: &str,
    image_paths: &[String],
    target_class: Option<&str>,
    min_confidence: f32,
) -> Result<Vec<Value>, String> {
    let total_started = Instant::now();
    if !min_confidence.is_finite() || !(0.0..=1.0).contains(&min_confidence) {
        return Err("置信度无效".into());
    }
    perf_log(format!("batch.start images={}", image_paths.len()));
    let started = Instant::now();
    let model = load_model(root, model_id, target_class)?;
    perf_log(format!(
        "batch.model_load model={} elapsed_ms={}",
        model_id,
        started.elapsed().as_secs_f64() * 1000.,
    ));
    let started = Instant::now();
    let prepared = prepare_images(image_paths, model.size);
    perf_log(format!(
        "batch.prepare images={} workers={} elapsed_ms={}",
        image_paths.len(),
        image_paths.len()
            .min(MAX_PREP_WORKERS)
            .min(std::thread::available_parallelism().map(|value| value.get()).unwrap_or(1).max(1)),
        started.elapsed().as_secs_f64() * 1000.,
    ));
    let valid = prepared.iter().enumerate()
        .filter_map(|(index, result)| result.as_ref().ok().map(|image| (index, image)))
        .collect::<Vec<_>>();
    if let Some(fixed_batch_size) = model.fixed_batch_size.filter(|size| *size > 1) {
        if !valid.is_empty() {
            perf_log(format!(
                "batch.use_fixed images={} batch_size={}",
                valid.len(),
                fixed_batch_size,
            ));
            let batch_results = infer_prepared_fixed_batch(
                &model,
                &valid,
                target_class,
                min_confidence,
                fixed_batch_size,
            )?;
            let results = merge_results(prepared, batch_results);
            perf_log(format!(
                "batch.finish mode=fixed images={} batch_size={} total_ms={} images_per_sec={:.3}",
                image_paths.len(),
                fixed_batch_size,
                total_started.elapsed().as_secs_f64() * 1000.,
                image_paths.len() as f64 / total_started.elapsed().as_secs_f64(),
            ));
            return Ok(results);
        }
    } else if valid.len() > 1 && model.supports_dynamic_batch && batch_support(&model) != Some(false) {
        perf_log(format!("batch.try_dynamic images={}", valid.len()));
        let (session_reused, mut session) = take_batch_session(&model)?;
        match infer_prepared_batch(
            &model,
            &valid,
            target_class,
            min_confidence,
            &mut session,
            session_reused,
        ) {
            Ok(batch_results) => {
                remember_batch_support(&model, true);
                return_batch_sessions(&model, vec![session]);
                let results = merge_results(prepared, batch_results);
                perf_log(format!(
                    "batch.finish mode=dynamic images={} total_ms={} images_per_sec={:.3}",
                    image_paths.len(),
                    total_started.elapsed().as_secs_f64() * 1000.,
                    image_paths.len() as f64 / total_started.elapsed().as_secs_f64(),
                ));
                return Ok(results);
            }
            Err(error) => {
                remember_batch_support(&model, false);
                perf_log(format!("batch.dynamic_fallback reason={error}"));
                drop(session);
            }
        }
    } else if valid.len() > 1 && !model.supports_dynamic_batch {
        perf_log("batch.dynamic_disabled reason=platform_static_model");
    }
    perf_log(format!("batch.use_parallel images={}", image_paths.len()));
    let results = infer_prepared_parallel(&model, prepared, target_class, min_confidence);
    perf_log(format!(
        "batch.finish mode=parallel images={} total_ms={} images_per_sec={:.3}",
        image_paths.len(),
        total_started.elapsed().as_secs_f64() * 1000.,
        image_paths.len() as f64 / total_started.elapsed().as_secs_f64(),
    ));
    results
}

fn draw_rect(image: &mut RgbImage, x: u32, y: u32, width: u32, height: u32) {
    if image.width() == 0 || image.height() == 0 { return; }
    let x = x.min(image.width().saturating_sub(1));
    let y = y.min(image.height().saturating_sub(1));
    let right = x.saturating_add(width).min(image.width().saturating_sub(1));
    let bottom = y.saturating_add(height).min(image.height().saturating_sub(1));
    let color = Rgb([41, 150, 124]);
    for offset in 0..3 {
        let left = x.saturating_sub(offset);
        let top = y.saturating_sub(offset);
        let right = right.saturating_add(offset).min(image.width().saturating_sub(1));
        let bottom = bottom.saturating_add(offset).min(image.height().saturating_sub(1));
        for horizontal in left..=right {
            image.put_pixel(horizontal, top, color);
            image.put_pixel(horizontal, bottom, color);
        }
        for vertical in top..=bottom {
            image.put_pixel(left, vertical, color);
            image.put_pixel(right, vertical, color);
        }
    }
}

fn annotated_thumbnail(path: &Path, detections: &[PreviewDetection]) -> Result<Vec<u8>, String> {
    let (mut image, source_width, source_height) = result_canvas(path)?;
    let scale_x = image.width() as f32 / source_width as f32;
    let scale_y = image.height() as f32 / source_height as f32;
    for detection in detections {
        draw_rect(&mut image,
            (detection.x as f32 * scale_x).round() as u32,
            (detection.y as f32 * scale_y).round() as u32,
            (detection.width as f32 * scale_x).round() as u32,
            (detection.height as f32 * scale_y).round() as u32);
    }
    let mut bytes = std::io::Cursor::new(Vec::new());
    image.write_to(&mut bytes, image::ImageFormat::Png).map_err(|_| "结果图生成失败")?;
    Ok(bytes.into_inner())
}

fn image_preview(path: &Path) -> Result<Vec<u8>, String> {
    let (image, _, _) = result_canvas(path)?;
    let mut bytes = std::io::Cursor::new(Vec::new());
    image.write_to(&mut bytes, image::ImageFormat::Png).map_err(|_| "原图预览生成失败")?;
    Ok(bytes.into_inner())
}

fn result_canvas(path: &Path) -> Result<(RgbImage, u32, u32), String> {
    let original = image::ImageReader::open(path).map_err(|_| "图片不可读")?
        .decode().map_err(|_| "图片解码失败")?.to_rgb8();
    let (source_width, source_height) = original.dimensions();
    Ok((imageops::thumbnail(&original, 1200, 900), source_width, source_height))
}

pub fn endpoint(root: &Path) -> Result<(String, String), String> {
    ENDPOINT.get_or_init(|| {
        let server = tiny_http::Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
        let url = format!("http://{}/detect", server.server_addr());
        let token = uuid::Uuid::new_v4().to_string();
        let secret = token.clone();
        let root = root.to_path_buf();
        std::thread::spawn(move || {
            for mut request in server.incoming_requests() {
                let authorized = request.headers().iter().any(|h| h.field.equiv("Authorization") && h.value.as_str() == format!("Bearer {secret}"));
                let is_single = request.url() == "/detect";
                let is_batch = request.url() == "/detect-batch";
                if !authorized || (!is_single && !is_batch) || request.method() != &tiny_http::Method::Post {
                    let _ = request.respond(tiny_http::Response::empty(403));
                    continue;
                }
                let max_body_length = if is_batch { 512 * 1024 } else { 16384 };
                if request.body_length().is_none_or(|len| len > max_body_length) {
                    let _ = request.respond(tiny_http::Response::empty(413));
                    continue;
                }
                let mut body = String::new();
                let result = request.as_reader().read_to_string(&mut body)
                    .map_err(|_| "请求格式无效".to_string())
                    .and_then(|_| {
                        if is_batch {
                            let input = serde_json::from_str::<BatchRequest>(&body)
                                .map_err(|_| "请求格式无效".to_string())?;
                            if input.image_paths.is_empty() {
                                return Err("批量图片不能为空".into());
                            }
                            if input.image_paths.len() > MAX_BATCH_IMAGES {
                                return Err(format!("单批最多处理 {MAX_BATCH_IMAGES} 张图片"));
                            }
                            let results = infer_batch(
                                &root,
                                &input.model_id,
                                &input.image_paths,
                                input.target_class.as_deref(),
                                input.min_confidence,
                            )?;
                            Ok(json!({
                                "ok": true,
                                "message": "批量推理完成",
                                "results": results,
                            }))
                        } else {
                            let input = serde_json::from_str::<Request>(&body)
                                .map_err(|_| "请求格式无效".to_string())?;
                            CACHE.lock()
                                .map_err(|_| "推理服务不可用".to_string())
                                .and_then(|mut cache| infer(&root, input, &mut cache))
                        }
                    });
                let value = result.unwrap_or_else(|message| json!({"ok":false,"message":message}));
                let _ = request.respond(tiny_http::Response::from_string(value.to_string()));
            }
        });
        Ok((url, token))
    }).clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn folder_scan_filters_and_recurses() {
        let root = std::env::temp_dir().join(format!("yolo-folder-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("sub")).unwrap();
        std::fs::write(root.join("a.JPG"), []).unwrap();
        std::fs::write(root.join("sub/b.png"), []).unwrap();
        std::fs::write(root.join("notes.txt"), []).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&root, root.join("sub/loop")).unwrap();
        let paths = folder_images(&root).unwrap();
        assert_eq!(paths.len(), 2);
        assert!(paths[0].ends_with("a.JPG"));
        assert!(paths[1].ends_with("b.png"));
        assert!(folder_images(&root.join("missing")).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn nms_is_class_aware() {
        let data = [10.,10.,10., 10.,10.,10., 4.,4.,4., 4.,4.,4., 0.9,0.8,0., 0.,0.,0.9];
        assert_eq!(decode(&data, 6, 3, 0.5).len(), 2);
        assert_eq!(decode(&data, 6, 3, 0.95).len(), 0);
    }

    #[test]
    #[ignore = "需要本地 ONNX 权重与原生运行时"]
    fn real_model_reuses_session() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().parent().unwrap();
        let path = std::env::temp_dir().join(format!("yolo-test-{}.png", uuid::Uuid::new_v4()));
        RgbImage::from_pixel(96, 64, Rgb([114, 114, 114])).save(&path).unwrap();
        let input = || Request { model_id: "yolov8n-coco".into(), image_path: path.to_string_lossy().into(),
            target_class: Some("person".into()), min_confidence: 0.5 };
        let mut cache = None;
        let start = std::time::Instant::now();
        let first = infer(root, input(), &mut cache);
        let cold = start.elapsed();
        let start = std::time::Instant::now();
        let second = infer(root, input(), &mut cache);
        let warm = start.elapsed();
        let (url, token) = endpoint(root).unwrap();
        let bridge = std::process::Command::new("node")
            .current_dir(root.join("app"))
            .env("YOLO_ONNX_URL", url)
            .env("YOLO_ONNX_TOKEN", token)
            .env("YOLO_TEST_IMAGE", &path)
            .args(["--input-type=module", "-e", "import assert from 'node:assert/strict'; import {yoloDetectTool} from './agent/tools/yolo.ts'; const response = await yoloDetectTool.execute('test', {modelId:'yolov8n-coco', imagePath:process.env.YOLO_TEST_IMAGE, targetClass:'person'}); const result=JSON.parse(response.content[0].text); assert.equal(result.ok,true); assert.equal(result.backend,'onnx'); assert.equal('detections' in result,false); const denied=await fetch(process.env.YOLO_ONNX_URL,{method:'POST',body:'{}'}); assert.equal(denied.status,403);"])
            .output().unwrap();
        std::fs::remove_file(path).unwrap();
        assert!(bridge.status.success(), "{}", String::from_utf8_lossy(&bridge.stderr));
        let first = first.unwrap();
        let second = second.unwrap();
        assert_eq!(first["sessionReused"], false);
        assert_eq!(second["sessionReused"], true);
        assert_eq!(second["count"], 0);
        eprintln!("cold={cold:?}, warm={warm:?}");
    }

    #[test]
    #[ignore = "需要本地 ONNX 权重与 100 张测试图片"]
    fn benchmark_100_images_throughput() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().parent().unwrap();
        let image_root = root.join("测试图片").join("10.26白色图片");
        let image_paths = folder_images(&image_root).unwrap().into_iter().take(100).collect::<Vec<_>>();
        assert_eq!(image_paths.len(), 100, "测试图片不足 100 张");
        let started = Instant::now();
        let mut processed = 0;
        perf_log(format!("benchmark.start images={} batch_size=32", image_paths.len()));
        let inference_started = Instant::now();
        for (batch_index, batch) in image_paths.chunks(32).enumerate() {
            let batch_started = Instant::now();
            let results = infer_batch(root, "yolov8n-coco", batch, None, 0.25).unwrap();
            assert_eq!(results.len(), batch.len());
            processed += batch.len();
        perf_log(format!(
            "benchmark.batch index={} images={} elapsed_ms={} images_per_sec={:.3}",
                batch_index + 1,
                batch.len(),
                batch_started.elapsed().as_secs_f64() * 1000.,
                batch.len() as f64 / batch_started.elapsed().as_secs_f64(),
            ));
        }
        let inference_elapsed = inference_started.elapsed();
        perf_log(format!(
            "benchmark.inference images={} total_ms={} images_per_sec={:.3}",
            processed,
            inference_elapsed.as_secs_f64() * 1000.,
            processed as f64 / inference_elapsed.as_secs_f64(),
        ));
        let thumbnail_started = Instant::now();
        let mut thumbnail_bytes = 0;
        for path in &image_paths {
            thumbnail_bytes += thumbnail(Path::new(path)).unwrap().len();
        }
        perf_log(format!(
            "benchmark.thumbnail images={} bytes={} total_ms={} images_per_sec={:.3}",
            image_paths.len(),
            thumbnail_bytes,
            thumbnail_started.elapsed().as_secs_f64() * 1000.,
            image_paths.len() as f64 / thumbnail_started.elapsed().as_secs_f64(),
        ));
        let elapsed = started.elapsed();
        perf_log(format!(
            "benchmark.finish_with_thumbnail images={} total_ms={} images_per_sec={:.3}",
            processed,
            elapsed.as_secs_f64() * 1000.,
            processed as f64 / elapsed.as_secs_f64(),
        ));
    }
}
