// 常驻 ONNX 推理服务：本机鉴权、会话复用与分类计数。
// Created on 2026-09-14
// @author: https://github.com/Linmoqian

use image::{imageops, Rgb, RgbImage};
use ort::{session::Session, value::Tensor};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::BTreeMap, path::Path, sync::{OnceLock, Mutex}};

static ENDPOINT: OnceLock<Result<(String, String), String>> = OnceLock::new();
static CACHE: Mutex<Option<(String, Session)>> = Mutex::new(None);

#[tauri::command]
pub async fn yolo_detect_image(model_id: String, image_path: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().parent().unwrap();
        let mut cache = CACHE.lock().map_err(|_| "推理服务不可用")?;
        infer(root, Request { model_id, image_path, target_class: None, min_confidence: 0.25 }, &mut cache)
    }).await.map_err(|_| "推理任务中断".to_string())?
}

#[tauri::command]
pub fn yolo_models() -> Result<Value, String> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().parent().unwrap();
    let entries: Vec<Value> = serde_json::from_slice(&std::fs::read(root.join("app/agent/tools/yolo-models.json")).map_err(|_| "模型清单不可读")?).map_err(|_| "模型清单无效")?;
    Ok(Value::Array(entries.into_iter().map(|entry| json!({"id":entry["id"], "name":entry["name"], "available":entry["onnxPath"].as_str().is_some_and(|path| root.join(path).is_file())})).collect()))
}

#[tauri::command]
pub async fn yolo_thumbnail(image_path: String) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let image = image::ImageReader::open(image_path).map_err(|_| "图片不可读")?.decode().map_err(|_| "图片解码失败")?;
        let mut bytes = std::io::Cursor::new(Vec::new());
        image.thumbnail(240, 180).write_to(&mut bytes, image::ImageFormat::Png).map_err(|_| "缩略图失败")?;
        Ok(bytes.into_inner())
    }).await.map_err(|_| "缩略图任务中断".to_string())?
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    model_id: String,
    image_path: String,
    target_class: Option<String>,
    min_confidence: f32,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Model {
    id: String,
    onnx_path: Option<String>,
    classes: Option<Vec<String>>,
    input_size: Option<u32>,
}

#[derive(Clone)]
struct Detection { class: usize, score: f32, rect: [f32; 4] }

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

fn infer(root: &Path, request: Request, cache: &mut Option<(String, Session)>) -> Result<Value, String> {
    if !request.min_confidence.is_finite() || !(0.0..=1.0).contains(&request.min_confidence) {
        return Err("置信度无效".into());
    }
    let models: Vec<Model> = serde_json::from_slice(&std::fs::read(root.join("app/agent/tools/yolo-models.json")).map_err(|_| "模型清单不可读")?)
        .map_err(|_| "模型清单无效")?;
    let model = models.into_iter().find(|m| m.id == request.model_id).ok_or("未知模型")?;
    let path = root.join(model.onnx_path.ok_or("该模型未登记 ONNX 权重")?);
    let classes = model.classes.ok_or("缺少有序类别清单")?;
    let size = model.input_size.ok_or("缺少输入尺寸")?;
    if classes.is_empty() || !(32..=2048).contains(&size) { return Err("模型配置无效".into()); }
    if let Some(target) = &request.target_class {
        if !classes.contains(target) { return Err("指定模型不支持该类别".into()); }
    }
    if !Path::new(&request.image_path).is_absolute() { return Err("图片必须为绝对路径".into()); }
    let reader = image::ImageReader::open(&request.image_path).map_err(|_| "图片不可读")?
        .with_guessed_format().map_err(|_| "图片格式无效")?;
    let image = reader.decode().map_err(|_| "图片解码失败或超过资源限制")?.to_rgb8();
    let (w, h) = image.dimensions();
    if w == 0 || h == 0 { return Err("图片尺寸无效".into()); }
    let ratio = (size as f64 / w as f64).min(size as f64 / h as f64);
    let nw = (w as f64 * ratio).round().max(1.) as u32;
    let nh = (h as f64 * ratio).round().max(1.) as u32;
    let mut padded = RgbImage::from_pixel(size, size, Rgb([114, 114, 114]));
    let resized = imageops::resize(&image, nw, nh, imageops::FilterType::Triangle);
    imageops::replace(&mut padded, &resized, ((size-nw)/2) as i64, ((size-nh)/2) as i64);
    let plane = (size * size) as usize;
    let mut input = vec![0_f32; plane * 3];
    for (i, pixel) in padded.pixels().enumerate() {
        for c in 0..3 { input[c * plane + i] = pixel[c] as f32 / 255.; }
    }
    let metadata = std::fs::metadata(&path).map_err(|_| "ONNX 权重不存在")?;
    let key = format!("{}:{:?}:{}", path.display(), metadata.modified().ok(), metadata.len());
    let reused = cache.as_ref().is_some_and(|(k, _)| k == &key);
    if !reused {
        let session = Session::builder().map_err(|_| "ONNX Runtime 初始化失败")?
            .with_intra_threads(2).map_err(|_| "线程配置失败")?
            .commit_from_file(path).map_err(|_| "ONNX 模型加载失败")?;
        *cache = Some((key, session));
    }
    let session = &mut cache.as_mut().unwrap().1;
    let tensor = Tensor::from_array(([1, 3, size as usize, size as usize], input)).map_err(|_| "输入张量失败")?;
    let output = session.run(ort::inputs![tensor]).map_err(|_| "ONNX 推理失败")?;
    let (shape, data) = output[0].try_extract_tensor::<f32>().map_err(|_| "输出类型不支持")?;
    if shape.len() != 3 || shape[0] != 1 || shape[1] != (classes.len()+4) as i64 || shape[2] <= 0 {
        return Err("仅支持 YOLOv8 detect 原始输出 [1,4+类别数,N]，请使用 nms=False 导出".into());
    }
    let detections = decode(data, shape[1] as usize, shape[2] as usize, request.min_confidence);
    let mut counts = BTreeMap::<String, usize>::new();
    if let Some(target) = &request.target_class { counts.insert(target.clone(), 0); }
    for detection in detections {
        let name = &classes[detection.class];
        if request.target_class.as_ref().is_none_or(|target| target == name) {
            *counts.entry(name.clone()).or_default() += 1;
        }
    }
    let count: usize = counts.values().sum();
    let message = if counts.is_empty() { "未检测到达到阈值的对象".into() } else {
        format!("这张照片检测到{}", counts.iter().map(|(name, count)| format!("{name} {count} 个")).collect::<Vec<_>>().join("、"))
    };
    Ok(json!({"ok":true,"count":count,"message":message,"sessionReused":reused}))
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
                if !authorized || request.url() != "/detect" || request.method() != &tiny_http::Method::Post {
                    let _ = request.respond(tiny_http::Response::empty(403));
                    continue;
                }
                if request.body_length().is_none_or(|len| len > 16384) {
                    let _ = request.respond(tiny_http::Response::empty(413));
                    continue;
                }
                let result = serde_json::from_reader(request.as_reader()).map_err(|_| "请求格式无效".to_string())
                    .and_then(|input| CACHE.lock().map_err(|_| "推理服务不可用".to_string()).and_then(|mut cache| infer(&root, input, &mut cache)));
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
}
