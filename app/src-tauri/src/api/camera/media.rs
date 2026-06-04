use std::fs;
use std::io::Cursor;
use std::path::PathBuf;

use image::ImageEncoder;
use tauri::State;

use super::CameraStateMutex;

/// 照片保存到 ~/.pod-agent/photos/
fn photos_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let dir = PathBuf::from(home).join(".pod-agent").join("photos");
    fs::create_dir_all(&dir).map_err(|e| format!("创建照片目录失败: {}", e))?;
    Ok(dir)
}

/// 从当前 pump 截取一帧并保存为 JPEG
#[tauri::command]
pub fn capture_photo(state: State<'_, CameraStateMutex>) -> Result<String, String> {
    let cam_state = state.lock().map_err(|e| e.to_string())?;
    let pump = cam_state
        .pump
        .as_ref()
        .ok_or("摄像头未启动".to_string())?;

    let frame = cameras::pump::capture_frame(pump).ok_or("截取帧失败".to_string())?;
    let rgb = cameras::to_rgb8(&frame).map_err(|e| format!("帧转换失败: {}", e))?;

    // 编码 JPEG
    let mut jpeg_buf = Vec::new();
    let writer = Cursor::new(&mut jpeg_buf);
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(writer, 95);
    encoder
        .write_image(&rgb, frame.width, frame.height, image::ExtendedColorType::Rgb8)
        .map_err(|e| format!("JPEG 编码失败: {}", e))?;

    // 生成文件名：时间戳
    let now = chrono::Local::now();
    let filename = format!("{}.jpg", now.format("%Y%m%d_%H%M%S"));
    let dir = photos_dir()?;
    let path = dir.join(&filename);

    fs::write(&path, &jpeg_buf).map_err(|e| format!("写入文件失败: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}
