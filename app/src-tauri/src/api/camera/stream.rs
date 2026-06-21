use std::io::Cursor;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use base64::Engine;
use image::ImageEncoder;
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;

use crate::api::model::yolo::detect::run_detect;
use crate::api::model::yolo::utils;
use super::{CameraDevice, CameraStateMutex};

/// pump 回调内每 N 帧执行一次 YOLO 推理
const DETECT_INTERVAL: usize = 3;

// ── Tauri Channel 事件 ──────────────────────────────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "event", content = "data")]
pub enum CameraEvent {
    /// 一帧 JPEG（base64 编码）
    Frame {
        data: String,
        width: u32,
        height: u32,
    },
    /// YOLO 检测结果（与上一帧同步）
    Detections {
        detections: Vec<utils::Detection>,
        inference_ms: u128,
    },
    /// 错误
    Error {
        message: String,
    },
}

// ── 相机错误日志（best-effort，写失败不 panic）─────────────────

/// 写一行错误日志到指定 jsonl 文件（每行一个 JSON 对象）。纯函数，可测。
fn write_camera_error_line(path: &std::path::Path, ts: u128, message: &str) {
    let line = serde_json::json!({ "ts": ts, "message": message }).to_string();
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        use std::io::Write;
        let _ = writeln!(f, "{}", line);
    }
}

/// 追加一条相机错误日志到 data/logs/camera_errors.jsonl
fn append_camera_error(message: &str) {
    let path = crate::paths::get_logs_dir().join("camera_errors.jsonl");
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    write_camera_error_line(&path, ts, message);
}

// ── 命令 ────────────────────────────────────────────────────────

/// 枚举系统中的摄像头设备
#[tauri::command]
pub fn list_cameras() -> Result<Vec<CameraDevice>, String> {
    let devices = cameras::devices().map_err(|e| format!("枚举摄像头失败: {}", e))?;
    let list: Vec<CameraDevice> = devices
        .iter()
        .map(|d| CameraDevice {
            id: d.id.0.clone(),
            name: d.name.clone(),
        })
        .collect();
    Ok(list)
}

/// 启动摄像头预览流
#[tauri::command]
pub fn start_camera_preview(
    device_id: Option<String>,
    on_frame: Channel<CameraEvent>,
    state: State<'_, CameraStateMutex>,
) -> Result<(), String> {
    // 如果已有 pump 在运行，先停止
    {
        let mut cam_state = state.lock().map_err(|e| e.to_string())?;
        if let Some(p) = cam_state.pump.take() {
            cameras::pump::stop_and_join(p);
        }
    }

    // 枚举设备并选择目标
    let devices = cameras::devices().map_err(|e| format!("枚举摄像头失败: {}", e))?;
    let device = if let Some(ref id) = device_id {
        devices
            .iter()
            .find(|d| &d.id.0 == id)
            .ok_or_else(|| format!("未找到摄像头: {}", id))?
    } else {
        devices
            .first()
            .ok_or("未找到可用摄像头".to_string())?
    };

    let config = cameras::StreamConfig {
        resolution: cameras::Resolution {
            width: 1280,
            height: 720,
        },
        framerate: 30,
        pixel_format: cameras::PixelFormat::Bgra8,
    };

    let camera = cameras::open(device, config).map_err(|e| format!("打开摄像头失败: {}", e))?;

    // Channel 需要 Send + 'static，用 Arc 包装
    let channel = Arc::new(on_frame);
    let send_error = channel.clone();

    // 克隆 YOLO 句柄和检测开关，移入 pump 闭包
    let (yolo_handle, detecting) = {
        let cam_state = state.lock().map_err(|e| e.to_string())?;
        (cam_state.yolo.clone(), cam_state.detecting.clone())
    };
    let frame_counter = Arc::new(AtomicUsize::new(0));

    let pump = cameras::pump::spawn(camera, move |frame| {
        // BGRA → RGB
        let rgb = match cameras::to_rgb8(&frame) {
            Ok(rgb) => rgb,
            Err(e) => {
                let _ = send_error.send(CameraEvent::Error {
                    message: format!("帧转换失败: {}", e),
                });
                return;
            }
        };

        // RGB → JPEG
        let mut jpeg_buf = Vec::new();
        let writer = Cursor::new(&mut jpeg_buf);
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(writer, 75);
        if let Err(e) = encoder.write_image(
            &rgb,
            frame.width,
            frame.height,
            image::ExtendedColorType::Rgb8,
        ) {
            let _ = send_error.send(CameraEvent::Error {
                message: format!("JPEG 编码失败: {}", e),
            });
            return;
        }

        // JPEG → base64 → 发送帧
        let b64 = base64::engine::general_purpose::STANDARD.encode(&jpeg_buf);
        let _ = channel.send(CameraEvent::Frame {
            data: b64,
            width: frame.width,
            height: frame.height,
        });

        // 每 N 帧执行 YOLO 推理（仅当模型已加载且检测已启用）
        if detecting.load(Ordering::Relaxed) {
            let count = frame_counter.fetch_add(1, Ordering::Relaxed) + 1;
            if count % DETECT_INTERVAL == 0 {
                if let Ok(mut model) = yolo_handle.lock() {
                    if model.is_some() {
                        let fw = frame.width;
                        let fh = frame.height;
                        match run_detect(&rgb, fw, fh, &mut model) {
                            Ok(result) => {
                                println!("[YOLO] pump 发送检测: {} 个框", result.detections.len());
                                let _ = channel.send(CameraEvent::Detections {
                                    detections: result.detections,
                                    inference_ms: result.inference_ms,
                                });
                            }
                            Err(e) => {
                                let msg = format!("YOLO 推理失败: {}", e);
                                let _ = send_error.send(CameraEvent::Error { message: msg.clone() });
                                append_camera_error(&msg);
                            }
                        }
                    }
                }
            }
        } else {
            frame_counter.store(0, Ordering::Relaxed);
        }
    });

    // 保存 pump 句柄
    {
        let mut cam_state = state.lock().map_err(|e| e.to_string())?;
        cam_state.pump = Some(pump);
    }

    Ok(())
}

/// 停止摄像头预览流
#[tauri::command]
pub fn stop_camera_preview(state: State<'_, CameraStateMutex>) -> Result<(), String> {
    let mut cam_state = state.lock().map_err(|e| e.to_string())?;
    if let Some(p) = cam_state.pump.take() {
        cameras::pump::stop_and_join(p);
    }
    Ok(())
}

/// 切换实时检测开关（前端 toggleDetection 同步到 Rust）
#[tauri::command]
pub fn set_yolo_detecting(
    enabled: bool,
    state: State<'_, CameraStateMutex>,
) -> Result<(), String> {
    let cam_state = state.lock().map_err(|e| e.to_string())?;
    cam_state.detecting.store(enabled, Ordering::Relaxed);
    if enabled {
        println!("[YOLO] 实时检测已启动");
    } else {
        println!("[YOLO] 实时检测已关闭");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_cameras() {
        match cameras::devices() {
            Ok(devices) => {
                println!("找到 {} 个摄像头设备:", devices.len());
                for d in &devices {
                    println!("  - id: {}, name: {}", d.id.0, d.name);
                }
            }
            Err(e) => {
                println!("枚举摄像头失败: {}", e);
            }
        }
    }

    #[test]
    fn write_camera_error_line_appends_jsonl() {
        let tmp = std::env::temp_dir().join("pod_agent_camera_err_test.jsonl");
        let _ = std::fs::remove_file(&tmp);
        write_camera_error_line(&tmp, 1700000000, "推理失败: onnx error");
        write_camera_error_line(&tmp, 1700000001, "第二行");
        let content = std::fs::read_to_string(&tmp).expect("读取日志失败");
        let lines: Vec<&str> = content.trim_end().lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].contains(r#""ts":1700000000"#));
        assert!(lines[0].contains(r#""message":"推理失败: onnx error""#));
        let _ = std::fs::remove_file(&tmp);
    }
}
