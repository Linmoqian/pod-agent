use serde::Serialize;
use tauri::State;
use usls::Model;

use crate::api::model::yolo::utils;
use crate::api::model::yolo::{process, YOLOStateMutex};
use crate::paths;

/// 加载检测结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectResult {
    pub detections: Vec<utils::Detection>,
    pub inference_ms: u128,
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
            let default = models_dir.join("yolo11n.onnx");
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
    let mut state = yolo.lock().map_err(|e| e.to_string())?;
    let model = state
        .model
        .as_mut()
        .ok_or("YOLO 模型未加载，请先调用 load_yolo_model")?;

    let image = process::load_image(&file_path)?;

    let start = std::time::Instant::now();
    let results = model
        .forward(&[image])
        .map_err(|e| format!("推理失败: {}", e))?;
    let inference_ms = start.elapsed().as_millis();

    let detections = results
        .first()
        .map(|r| utils::extract_detections(r, &usls::NAMES_COCO_80))
        .unwrap_or_default();

    Ok(DetectResult {
        detections,
        inference_ms,
    })
}

/// 检测 RGB 字节流（用于摄像头帧）
#[tauri::command]
pub fn detect_from_bytes(
    rgb_bytes: Vec<u8>,
    width: u32,
    height: u32,
    yolo: State<'_, YOLOStateMutex>,
) -> Result<DetectResult, String> {
    let mut state = yolo.lock().map_err(|e| e.to_string())?;
    let model = state
        .model
        .as_mut()
        .ok_or("YOLO 模型未加载，请先调用 load_yolo_model")?;

    let image = process::rgb_bytes_to_image(&rgb_bytes, width, height)?;

    let start = std::time::Instant::now();
    let results = model
        .forward(&[image])
        .map_err(|e| format!("推理失败: {}", e))?;
    let inference_ms = start.elapsed().as_millis();

    let detections = results
        .first()
        .map(|r| utils::extract_detections(r, &usls::NAMES_COCO_80))
        .unwrap_or_default();

    Ok(DetectResult {
        detections,
        inference_ms,
    })
}
