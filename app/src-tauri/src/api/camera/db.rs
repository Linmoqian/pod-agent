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

    // 兼容旧数据库：batch_label 列（照片批次归属，承重墙组织维度）
    add_column_if_missing(conn, "photos", "batch_label", "TEXT NOT NULL DEFAULT ''")?;

    Ok(())
}

/// 初始化 phenotypes 表，在 init_db 中调用
pub fn init_phenotypes_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS phenotypes (
            id TEXT PRIMARY KEY,
            photo_id TEXT NOT NULL REFERENCES photos(id),
            class_name TEXT NOT NULL,
            count INTEGER NOT NULL,
            avg_confidence REAL NOT NULL,
            min_confidence REAL NOT NULL,
            max_confidence REAL NOT NULL,
            items TEXT NOT NULL,
            created_at TEXT NOT NULL,
            n_low INTEGER NOT NULL DEFAULT 0,
            n_high INTEGER NOT NULL DEFAULT 0,
            reviewed INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_phenotypes_photo_id ON phenotypes(photo_id);
        CREATE INDEX IF NOT EXISTS idx_phenotypes_class_name ON phenotypes(class_name);",
    )
    .map_err(|e| format!("创建 phenotypes 表失败: {}", e))?;

    // 兼容旧数据库：补齐真相字段（reviewed/n_low/n_high）
    add_column_if_missing(conn, "phenotypes", "n_low", "INTEGER NOT NULL DEFAULT 0")?;
    add_column_if_missing(conn, "phenotypes", "n_high", "INTEGER NOT NULL DEFAULT 0")?;
    add_column_if_missing(conn, "phenotypes", "reviewed", "INTEGER NOT NULL DEFAULT 0")?;

    Ok(())
}

/// 若列不存在则添加（与 thinking/detections 列的兼容模式一致）
fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    decl: &str,
) -> Result<(), String> {
    let probe = format!("SELECT {} FROM {} LIMIT 0", column, table);
    let has_column = conn.prepare(&probe).is_ok();
    if !has_column {
        let sql = format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, decl);
        conn.execute_batch(&sql)
            .map_err(|e| format!("添加 {} 列失败: {}", column, e))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::agent::session::db::init_db;

    #[test]
    fn photos_table_has_batch_label() {
        let state = init_db(":memory:").expect("init_db 失败");
        let conn = state.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO photos (id, file_path, thumbnail_path, captured_at, width, height, mode, batch_label) \
             VALUES ('p1','/x.jpg','/t.jpg','2026-01-01 00:00:00',1280,720,'photo','A小区-3棚')",
            [],
        )
        .expect("插入失败");
        let label: String = conn
            .query_row("SELECT batch_label FROM photos WHERE id='p1'", [], |r| r.get(0))
            .expect("查询失败");
        assert_eq!(label, "A小区-3棚");
    }
}
