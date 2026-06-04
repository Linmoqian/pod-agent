use serde::Serialize;
use tauri::State;
use usls::Model;

use crate::api::model::yolo::utils;
use crate::api::model::yolo::YOLOStateMutex;
use crate::api::camera::CameraStateMutex;
use crate::paths;

/// 加载检测结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectResult {
    pub detections: Vec<utils::Detection>,
    pub inference_ms: u128,
}

/// 内部：执行推理并提取结果（预处理在锁外完成）
fn run_detect(
    image: usls::Image,
    state: &mut crate::api::model::yolo::YOLOState,
) -> Result<DetectResult, String> {
    let model = state
        .model
        .as_mut()
        .ok_or("YOLO 模型未加载，请先调用 load_yolo_model")?;

    let start = std::time::Instant::now();
    let results = model
        .forward(&[image])
        .map_err(|e| format!("推理失败: {}", e))?;
    let inference_ms = start.elapsed().as_millis();

    let detections = results
        .first()
        .map(utils::extract_detections)
        .unwrap_or_default();

    Ok(DetectResult {
        detections,
        inference_ms,
    })
}

/// 加载 YOLO 模型
#[tauri::command]
pub fn load_yolo_model(
    model_path: Option<String>,
    yolo: State<'_, YOLOStateMutex>,
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

    let mut state = yolo.lock().map_err(|e| e.to_string())?;
    state.model = Some(model);

    Ok(format!("模型加载成功: {}", path))
}

/// 卸载 YOLO 模型
#[tauri::command]
pub fn unload_yolo_model(yolo: State<'_, YOLOStateMutex>) -> Result<(), String> {
    let mut state = yolo.lock().map_err(|e| e.to_string())?;
    state.model = None;
    Ok(())
}

/// 检测照片文件
#[tauri::command]
pub fn detect_photo(
    file_path: String,
    yolo: State<'_, YOLOStateMutex>,
) -> Result<DetectResult, String> {
    // 预处理在锁外
    let image = usls::Image::try_read(&file_path)
        .map_err(|e| format!("加载图片失败: {}", e))?;

    let mut state = yolo.lock().map_err(|e| e.to_string())?;
    run_detect(image, &mut state)
}

/// 检测 RGB 字节流（用于摄像头帧）
#[tauri::command]
pub fn detect_from_bytes(
    rgb_bytes: Vec<u8>,
    width: u32,
    height: u32,
    yolo: State<'_, YOLOStateMutex>,
) -> Result<DetectResult, String> {
    // 预处理在锁外
    let image = usls::Image::from_u8s(&rgb_bytes, width, height)
        .map_err(|e| format!("创建图像失败: {}", e))?;

    let mut state = yolo.lock().map_err(|e| e.to_string())?;
    run_detect(image, &mut state)
}

/// 从摄像头当前帧检测（Rust 端直接取帧，避免 IPC 传输）
#[tauri::command]
pub fn detect_from_camera(
    camera: State<'_, CameraStateMutex>,
    yolo: State<'_, YOLOStateMutex>,
) -> Result<DetectResult, String> {
    // 1. 锁 camera，取帧
    let cam_state = camera.lock().map_err(|e| e.to_string())?;
    let pump = cam_state
        .pump
        .as_ref()
        .ok_or("摄像头未启动")?;
    let frame = cameras::pump::capture_frame(pump).ok_or("截取帧失败")?;
    let rgb = cameras::to_rgb8(&frame).map_err(|e| format!("帧转换失败: {}", e))?;
    let (w, h) = (frame.width, frame.height);
    drop(cam_state); // 释放 camera 锁

    // 2. 构建 Image
    let image = usls::Image::from_u8s(&rgb, w, h)
        .map_err(|e| format!("创建图像失败: {}", e))?;

    // 3. 锁 YOLO，推理
    let mut yolo_state = yolo.lock().map_err(|e| e.to_string())?;
    run_detect(image, &mut yolo_state)
}
