use std::fs;
use std::io::Cursor;
use std::path::PathBuf;

use base64::Engine;
use image::ImageEncoder;
use serde::Serialize;
use tauri::State;

use super::CameraStateMutex;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureResult {
    pub photo_path: String,
    /// 缩略图 base64，前端可直接用于 <img src="data:image/jpeg;base64,...">
    pub thumbnail_data: String,
}

/// 照片保存到 ~/.pod-agent/photos/
fn photos_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let dir = PathBuf::from(home).join(".pod-agent").join("photos");
    fs::create_dir_all(&dir).map_err(|e| format!("创建照片目录失败: {}", e))?;
    Ok(dir)
}

/// 从当前 pump 截取一帧，保存原图，返回原图路径 + 缩略图 base64
#[tauri::command]
pub fn capture_photo(state: State<'_, CameraStateMutex>) -> Result<CaptureResult, String> {
    let cam_state = state.lock().map_err(|e| e.to_string())?;
    let pump = cam_state
        .pump
        .as_ref()
        .ok_or("摄像头未启动".to_string())?;

    let frame = cameras::pump::capture_frame(pump).ok_or("截取帧失败".to_string())?;
    let rgb = cameras::to_rgb8(&frame).map_err(|e| format!("帧转换失败: {}", e))?;

    let now = chrono::Local::now();
    let filename = format!("{}.jpg", now.format("%Y%m%d_%H%M%S"));

    // ── 保存原图 (Q=95) ──────────────────────────────────────
    let photo_dir = photos_dir()?;
    let photo_path = photo_dir.join(&filename);

    let mut jpeg_buf = Vec::new();
    let writer = Cursor::new(&mut jpeg_buf);
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(writer, 95);
    encoder
        .write_image(&rgb, frame.width, frame.height, image::ExtendedColorType::Rgb8)
        .map_err(|e| format!("JPEG 编码失败: {}", e))?;

    fs::write(&photo_path, &jpeg_buf).map_err(|e| format!("写入文件失败: {}", e))?;

    // ── 生成缩略图 base64 (200×200, Q=80) ────────────────────
    let img =
        image::ImageBuffer::from_raw(frame.width, frame.height, rgb).ok_or("创建图像缓冲区失败")?;
    let dynamic = image::DynamicImage::ImageRgb8(img);
    let thumb = dynamic.thumbnail(200, 200);

    let mut thumb_buf = Vec::new();
    let thumb_writer = Cursor::new(&mut thumb_buf);
    let thumb_encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(thumb_writer, 80);
    thumb_encoder
        .write_image(
            thumb.as_bytes(),
            thumb.width(),
            thumb.height(),
            image::ExtendedColorType::from(thumb.color()),
        )
        .map_err(|e| format!("缩略图编码失败: {}", e))?;

    let thumbnail_data = base64::engine::general_purpose::STANDARD.encode(&thumb_buf);

    Ok(CaptureResult {
        photo_path: photo_path.to_string_lossy().to_string(),
        thumbnail_data,
    })
}
