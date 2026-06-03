use crate::agent::session::{Session, Message, db::DbState};
use tauri::State;
use uuid::Uuid;
use chrono::Local;

#[tauri::command]
pub fn create_session(title: String, db: State<DbState>) -> Result<Session, String> {
    let session = Session {
        id: Uuid::new_v4().to_string(),
        title,
        created_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        updated_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
    conn.execute(
        "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        [&session.id, &session.title, &session.created_at, &session.updated_at],
    )
    .map_err(|e| format!("插入会话失败: {}", e))?;

    Ok(session)
}

#[tauri::command]
pub fn create_message(
    session_id: String,
    role: String,
    content: String,
    db: State<DbState>,
) -> Result<Message, String> {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let message = Message {
        id: Uuid::new_v4().to_string(),
        session_id,
        role,
        content,
        created_at: now.clone(),
    };

    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
    conn.execute(
        "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        [&message.id, &message.session_id, &message.role, &message.content, &message.created_at],
    )
    .map_err(|e| format!("插入消息失败: {}", e))?;

    conn.execute(
        "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
        [&now, &message.session_id],
    )
    .map_err(|e| format!("更新会话时间戳失败: {}", e))?;

    Ok(message)
}
