use std::collections::HashMap;
use std::fs;
use std::io::Cursor;
use std::path::PathBuf;

use base64::Engine;
use image::ImageEncoder;
use serde::Serialize;
use tauri::State;

use rusqlite::Connection;

use crate::agent::session::db::DbState;
use crate::api::model::yolo::utils;
use super::{CameraStateMutex, PhenotypeItem, PhenotypeSummary, Photo};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhenotypeRecord {
    pub id: String,
    pub photo_id: String,
    pub class_name: String,
    pub count: usize,
    pub avg_confidence: f32,
    pub min_confidence: f32,
    pub max_confidence: f32,
    pub n_low: i32,
    pub n_high: i32,
    pub reviewed: bool,
    pub items: Vec<PhenotypeItem>,
    pub created_at: String,
}

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
    batch_label: Option<String>,
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

    let detections_json = detections.as_ref().and_then(|d| serde_json::to_string(d).ok());

    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
    let batch = batch_label.unwrap_or_default();
    conn.execute(
        "INSERT INTO photos (id, file_path, thumbnail_path, captured_at, width, height, mode, detections, batch_label) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![id, photo_path_str, thumb_path_str, captured_at, frame.width, frame.height, "photo", detections_json, batch],
    )
    .map_err(|e| format!("写入照片记录失败: {}", e))?;

    // ── 计算并写入表型数据 ──────────────────────────────────
    if let Some(ref dets) = detections {
        if !dets.is_empty() {
            let summaries = compute_phenotypes(dets, &id, &captured_at);
            for s in &summaries {
                let items_json = serde_json::to_string(&s.items)
                    .map_err(|e| format!("序列化表型 items 失败: {}", e))?;
                conn.execute(
                    "INSERT INTO phenotypes (id, photo_id, class_name, count, avg_confidence, min_confidence, max_confidence, items, created_at, n_low, n_high, reviewed) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                    rusqlite::params![s.id, s.photo_id, s.class_name, s.count as i32, s.avg_confidence, s.min_confidence, s.max_confidence, items_json, s.created_at, s.n_low, s.n_high, s.reviewed as i32],
                )
                .map_err(|e| format!("写入表型数据失败: {}", e))?;
            }
        }
    }

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
        .prepare("SELECT id, file_path, thumbnail_path, captured_at, width, height, mode, detections, batch_label FROM photos ORDER BY captured_at DESC LIMIT ?1 OFFSET ?2")
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
                batch_label: row.get(8)?,
            })
        })
        .map_err(|e| format!("解析照片记录失败: {}", e))?
        .filter_map(|p| p.ok())
        .collect();

    Ok(photos)
}

/// 置信度门槛：低于此值的检测框不纳入表型聚合（保留为 n_low 计数，不静默丢弃）
const MIN_CONFIDENCE: f32 = 0.5;
/// 高置信阈值（用于 n_high 统计，标识可信检测）
const HIGH_CONFIDENCE: f32 = 0.8;

/// 按 class_name 分组计算表型数据
///
/// 尊重数据真相：
/// - 仅对 confidence >= MIN_CONFIDENCE 的有效框聚合 avg/min/max（修复旧的 count=0→avg=0.0、空集→±INFINITY 两处脏数据）
/// - 全部低于阈值的 class 不生成聚合行（原始检测仍完整保留在 photos.detections JSON，可追溯）
/// - n_low 记录被过滤的低置信框数，n_high 记录高置信框数，让脏度可见而非被平均掩盖
fn compute_phenotypes(
    detections: &[utils::Detection],
    photo_id: &str,
    captured_at: &str,
) -> Vec<PhenotypeSummary> {
    let mut groups: HashMap<&str, Vec<&utils::Detection>> = HashMap::new();
    for d in detections {
        groups.entry(&d.class_name).or_default().push(d);
    }

    groups
        .into_iter()
        .filter_map(|(class_name, dets)| {
            let n_low = dets.iter().filter(|d| d.confidence < MIN_CONFIDENCE).count();
            let n_high = dets.iter().filter(|d| d.confidence >= HIGH_CONFIDENCE).count();

            // 仅有效框参与聚合
            let valid: Vec<&utils::Detection> = dets
                .iter()
                .copied()
                .filter(|d| d.confidence >= MIN_CONFIDENCE)
                .collect();
            if valid.is_empty() {
                return None;
            }

            let items: Vec<PhenotypeItem> = valid
                .iter()
                .map(|d| {
                    let w = d.x_max - d.x_min;
                    let h = d.y_max - d.y_min;
                    PhenotypeItem {
                        width: w,
                        height: h,
                        area: w * h,
                        confidence: d.confidence,
                    }
                })
                .collect();

            let confs: Vec<f32> = items.iter().map(|i| i.confidence).collect();
            let count = items.len();
            let sum: f32 = confs.iter().sum();

            Some(PhenotypeSummary {
                id: uuid::Uuid::new_v4().to_string(),
                photo_id: photo_id.to_string(),
                class_name: class_name.to_string(),
                count,
                avg_confidence: sum / count as f32,
                min_confidence: confs.iter().cloned().fold(f32::INFINITY, f32::min),
                max_confidence: confs.iter().cloned().fold(f32::NEG_INFINITY, f32::max),
                n_low: n_low as i32,
                n_high: n_high as i32,
                reviewed: false,
                items,
                created_at: captured_at.to_string(),
            })
        })
        .collect()
}

/// 查询指定照片的表型数据
#[tauri::command]
pub fn get_phenotypes(photo_id: String, db: State<'_, DbState>) -> Result<Vec<PhenotypeRecord>, String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT id, photo_id, class_name, count, avg_confidence, min_confidence, max_confidence, items, created_at, n_low, n_high, reviewed FROM phenotypes WHERE photo_id = ?1")
        .map_err(|e| format!("查询表型数据失败: {}", e))?;

    let records = stmt
        .query_map([photo_id], |row| {
            let items_json: String = row.get(7)?;
            let items: Vec<PhenotypeItem> = serde_json::from_str(&items_json).unwrap_or_default();
            Ok(PhenotypeRecord {
                id: row.get(0)?,
                photo_id: row.get(1)?,
                class_name: row.get(2)?,
                count: row.get::<_, i32>(3)? as usize,
                avg_confidence: row.get(4)?,
                min_confidence: row.get(5)?,
                max_confidence: row.get(6)?,
                items,
                created_at: row.get(8)?,
                n_low: row.get(9)?,
                n_high: row.get(10)?,
                reviewed: row.get::<_, i32>(11)? != 0,
            })
        })
        .map_err(|e| format!("解析表型记录失败: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(records)
}

/// 查询所有已使用的批次标签（去重、排除空串、排序）。纯函数，可测。
fn distinct_batch_labels(conn: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT DISTINCT batch_label FROM photos WHERE batch_label != '' ORDER BY batch_label")
        .map_err(|e| format!("查询批次列表失败: {}", e))?;
    let labels: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("解析批次列表失败: {}", e))?
        .filter_map(|l| l.ok())
        .collect();
    Ok(labels)
}

/// 供批次栏下拉复用历史批次。前端：invoke("list_batch_labels")
#[tauri::command]
pub fn list_batch_labels(db: State<'_, DbState>) -> Result<Vec<String>, String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
    distinct_batch_labels(&conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::session::db::init_db;

    fn insert_photo(conn: &Connection, id: &str, label: &str) {
        conn.execute(
            "INSERT INTO photos (id, file_path, thumbnail_path, captured_at, width, height, mode, batch_label) \
             VALUES (?1,'/x','/t','2026-01-01 00:00:00',1,1,'photo',?2)",
            rusqlite::params![id, label],
        )
        .unwrap();
    }

    #[test]
    fn distinct_batch_labels_sorted_no_empty() {
        let state = init_db(":memory:").expect("init_db 失败");
        let conn = state.conn.lock().unwrap();
        insert_photo(&conn, "p1", "B小区");
        insert_photo(&conn, "p2", "A小区");
        insert_photo(&conn, "p3", ""); // 空串应被排除
        insert_photo(&conn, "p4", "B小区"); // 重复应去重
        let labels = distinct_batch_labels(&conn).unwrap();
        assert_eq!(labels, vec!["A小区".to_string(), "B小区".to_string()]);
    }
}
