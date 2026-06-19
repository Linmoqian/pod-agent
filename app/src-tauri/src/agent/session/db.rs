use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct DbState {
    pub conn: Mutex<Connection>,
}

pub fn init_db(db_path: &str) -> Result<DbState, String> {
    let path = PathBuf::from(db_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建数据库目录失败: {}", e))?;
    }

    let conn = Connection::open(db_path)
        .map_err(|e| format!("打开数据库失败: {}", e))?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")
        .map_err(|e| format!("设置 WAL 模式失败: {}", e))?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            thinking TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);",
    )
    .map_err(|e| format!("创建表失败: {}", e))?;

    // 兼容旧数据库：如果 messages 表没有 thinking 列，自动添加
    let has_thinking: bool = conn
        .prepare("SELECT thinking FROM messages LIMIT 0")
        .is_ok();
    if !has_thinking {
        conn.execute_batch("ALTER TABLE messages ADD COLUMN thinking TEXT NOT NULL DEFAULT '';")
            .map_err(|e| format!("添加 thinking 列失败: {}", e))?;
    }

    crate::api::camera::db::init_photos_table(&conn)?;
    crate::api::camera::db::init_phenotypes_table(&conn)?;
    crate::agent::tool::db::init_tool_call_log_table(&conn)?;

    Ok(DbState {
        conn: Mutex::new(conn),
    })
}
