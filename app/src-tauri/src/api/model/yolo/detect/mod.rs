use serde::Serialize;
use tauri::State;
use usls::{Model, Runtime};
use usls::models::YOLO;

use crate::api::camera::CameraStateMutex;
use crate::api::model::yolo::{preprocess, utils};
use crate::paths;

/// 加载检测结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectResult {
    pub detections: Vec<utils::Detection>,
    pub inference_ms: u128,
}

/// 内部：预处理 → 推理 → 坐标映射回原图
pub fn run_detect(
    rgb: &[u8],
    width: u32,
    height: u32,
    model: &mut Option<Runtime<YOLO>>,
) -> Result<DetectResult, String> {
    // 1. Letterbox 预处理（原图 → 640×640）
    let (preprocessed, info) = preprocess::letterbox(rgb, width, height);

    // 2. 创建推理图像（已经是模型输入尺寸，usls 不再缩放）
    let image = usls::Image::from_u8s(
        &preprocessed,
        preprocess::MODEL_INPUT_SIZE,
        preprocess::MODEL_INPUT_SIZE,
    )
    .map_err(|e| format!("创建图像失败: {}", e))?;

    // 3. 推理
    let model = model
        .as_mut()
        .ok_or("YOLO 模型未加载，请先调用 load_yolo_model")?;

    let start = std::time::Instant::now();
    let results = model
        .forward(&[image])
        .map_err(|e| format!("推理失败: {}", e))?;
    let inference_ms = start.elapsed().as_millis();

    // 4. 提取检测结果
    let mut detections = results
        .first()
        .map(utils::extract_detections)
        .unwrap_or_default();

    // 5. 坐标映射：推理空间 → 原图像素空间
    preprocess::map_to_original(&mut detections, &info);

    Ok(DetectResult {
        detections,
        inference_ms,
    })
}

/// 加载 YOLO 模型
#[tauri::command]
pub fn load_yolo_model(
    model_path: Option<String>,
    camera: State<'_, CameraStateMutex>,
) -> Result<String, String> {
    let path = match model_path {
        Some(p) => p,
        None => {
            let models_dir = paths::get_models_dir();
            let default = models_dir.join("yolov8n.onnx");
            if !default.exists() {
                return Err(format!(
                    "默认模型不存在: {}\n请下载模型到 data/models/ 目录",
                    default.display()
                ));
            }
            default.to_string_lossy().to_string()
        }
    };

    let config = utils::build_detect_config(&path)?;
    let model = usls::models::YOLO::new(config)
        .map_err(|e| format!("加载 YOLO 模型失败: {}", e))?;

    let cam_state = camera.lock().map_err(|e| e.to_string())?;
    let mut yolo = cam_state.yolo.lock().map_err(|e| e.to_string())?;
    *yolo = Some(model);

    Ok(format!("模型加载成功: {}", path))
}

/// 卸载 YOLO 模型
#[tauri::command]
pub fn unload_yolo_model(camera: State<'_, CameraStateMutex>) -> Result<(), String> {
    let cam_state = camera.lock().map_err(|e| e.to_string())?;
    let mut yolo = cam_state.yolo.lock().map_err(|e| e.to_string())?;
    *yolo = None;
    Ok(())
}

/// 检测照片文件
#[tauri::command]
pub fn detect_photo(
    file_path: String,
    camera: State<'_, CameraStateMutex>,
) -> Result<DetectResult, String> {
    // 用 image crate 读取文件，获取 RGB + 尺寸
    let img = image::open(&file_path)
        .map_err(|e| format!("加载图片失败: {}", e))?
        .to_rgb8();
    let (w, h) = img.dimensions();
    let rgb = img.into_raw();

    let handle = {
        let cam_state = camera.lock().map_err(|e| e.to_string())?;
        cam_state.yolo.clone()
    };
    let mut model = handle.lock().map_err(|e| e.to_string())?;
    run_detect(&rgb, w, h, &mut model)
}

/// 检测 RGB 字节流（用于摄像头帧）
#[tauri::command]
pub fn detect_from_bytes(
    rgb_bytes: Vec<u8>,
    width: u32,
    height: u32,
    camera: State<'_, CameraStateMutex>,
) -> Result<DetectResult, String> {
    let handle = {
        let cam_state = camera.lock().map_err(|e| e.to_string())?;
        cam_state.yolo.clone()
    };
    let mut model = handle.lock().map_err(|e| e.to_string())?;
    run_detect(&rgb_bytes, width, height, &mut model)
}
