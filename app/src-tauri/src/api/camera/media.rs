use std::fs;
use std::io::Cursor;
use std::path::PathBuf;

use base64::Engine;
use image::ImageEncoder;
use serde::Serialize;
use tauri::State;

use crate::agent::session::db::DbState;
use crate::api::model::yolo::utils;
use super::{CameraStateMutex, Photo};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureResult {
    pub photo_path: String,
    /// 原图 base64
    pub photo_data: String,
    /// 缩略图 base64
    pub thumbnail_data: String,
}

/// 照片保存到 {data_dir}/photos/
fn photos_dir() -> PathBuf {
    crate::paths::get_photos_dir()
}

/// 缩略图保存到 {data_dir}/photos/thumbnails/
fn thumbnails_dir() -> PathBuf {
    crate::paths::get_thumbnails_dir()
}

/// 从当前 pump 截取一帧，保存原图 + 缩略图，写入数据库
#[tauri::command]
pub fn capture_photo(
    camera: State<'_, CameraStateMutex>,
    db: State<'_, DbState>,
    detections: Option<Vec<utils::Detection>>,
) -> Result<CaptureResult, String> {
    let cam_state = camera.lock().map_err(|e| e.to_string())?;
    let pump = cam_state
        .pump
        .as_ref()
        .ok_or("摄像头未启动".to_string())?;

    let frame = cameras::pump::capture_frame(pump).ok_or("截取帧失败".to_string())?;
    let rgb = cameras::to_rgb8(&frame).map_err(|e| format!("帧转换失败: {}", e))?;

    let now = chrono::Local::now();
    let id = uuid::Uuid::new_v4().to_string();
    let filename = format!("{}.jpg", now.format("%Y%m%d_%H%M%S"));
    let captured_at = now.format("%Y-%m-%d %H:%M:%S").to_string();

    // ── 保存原图 (Q=95) ──────────────────────────────────────
    let photo_dir = photos_dir();
    let photo_path = photo_dir.join(&filename);

    let mut jpeg_buf = Vec::new();
    let writer = Cursor::new(&mut jpeg_buf);
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(writer, 95);
    encoder
        .write_image(&rgb, frame.width, frame.height, image::ExtendedColorType::Rgb8)
        .map_err(|e| format!("JPEG 编码失败: {}", e))?;

    fs::write(&photo_path, &jpeg_buf).map_err(|e| format!("写入文件失败: {}", e))?;
    let photo_data = base64::engine::general_purpose::STANDARD.encode(&jpeg_buf);

    // ── 生成缩略图 (200×200, Q=80) ──────────────────────────
    let thumb_dir = thumbnails_dir();
    let thumb_path = thumb_dir.join(&filename);

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

    fs::write(&thumb_path, &thumb_buf).map_err(|e| format!("写入缩略图失败: {}", e))?;
    let thumbnail_data = base64::engine::general_purpose::STANDARD.encode(&thumb_buf);

    // ── 写入数据库 ───────────────────────────────────────────
    let photo_path_str = photo_path.to_string_lossy().to_string();
    let thumb_path_str = thumb_path.to_string_lossy().to_string();

    let detections_json = detections
        .filter(|d| !d.is_empty())
        .map(|d| serde_json::to_string(&d).unwrap_or_else(|_| "[]".to_string()));

    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
    conn.execute(
        "INSERT INTO photos (id, file_path, thumbnail_path, captured_at, width, height, mode, detections) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![id, photo_path_str, thumb_path_str, captured_at, frame.width, frame.height, "photo", detections_json],
    )
    .map_err(|e| format!("写入照片记录失败: {}", e))?;

    Ok(CaptureResult {
        photo_path: photo_path.to_string_lossy().to_string(),
        photo_data,
        thumbnail_data,
    })
}

/// 加载最近一张照片的缩略图 base64
#[tauri::command]
pub fn load_last_photo(db: State<'_, DbState>) -> Result<Option<String>, String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT thumbnail_path FROM photos ORDER BY captured_at DESC LIMIT 1")
        .map_err(|e| format!("查询照片失败: {}", e))?;

    let thumb_path: Option<String> = stmt
        .query_row([], |row| row.get(0))
        .ok();

    let Some(path) = thumb_path else {
        return Ok(None);
    };

    let data = fs::read(&path).map_err(|e| format!("读取缩略图失败: {}", e))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);

    Ok(Some(b64))
}

/// 按文件路径读取照片，返回 base64
#[tauri::command]
pub fn read_photo_data(path: String) -> Result<String, String> {
    let data = fs::read(&path).map_err(|e| format!("读取照片失败: {}", e))?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    Ok(b64)
}

/// 分页查询照片列表
#[tauri::command]
pub fn list_photos(limit: u32, offset: u32, db: State<'_, DbState>) -> Result<Vec<Photo>, String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT id, file_path, thumbnail_path, captured_at, width, height, mode, detections FROM photos ORDER BY captured_at DESC LIMIT ?1 OFFSET ?2")
        .map_err(|e| format!("查询照片列表失败: {}", e))?;

    let photos = stmt
        .query_map([limit, offset], |row| {
            Ok(Photo {
                id: row.get(0)?,
                file_path: row.get(1)?,
                thumbnail_path: row.get(2)?,
                captured_at: row.get(3)?,
                width: row.get(4)?,
                height: row.get(5)?,
                mode: row.get(6)?,
                detections: row.get(7)?,
            })
        })
        .map_err(|e| format!("解析照片记录失败: {}", e))?
        .filter_map(|p| p.ok())
        .collect();

    Ok(photos)
}
