use rusqlite::Connection;

/// 初始化 photos 表，在 init_db 中调用
pub fn init_photos_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS photos (
            id TEXT PRIMARY KEY,
            file_path TEXT NOT NULL,
            thumbnail_path TEXT NOT NULL,
            captured_at TEXT NOT NULL,
            width INTEGER NOT NULL,
            height INTEGER NOT NULL,
            mode TEXT NOT NULL DEFAULT 'photo'
        );
        CREATE INDEX IF NOT EXISTS idx_photos_captured_at ON photos(captured_at);",
    )
    .map_err(|e| format!("创建 photos 表失败: {}", e))?;

    // 兼容旧数据库：如果 photos 表没有 detections 列，自动添加
    let has_detections: bool = conn
        .prepare("SELECT detections FROM photos LIMIT 0")
        .is_ok();
    if !has_detections {
        conn.execute_batch("ALTER TABLE photos ADD COLUMN detections TEXT;")
            .map_err(|e| format!("添加 detections 列失败: {}", e))?;
    }

    Ok(())
}
