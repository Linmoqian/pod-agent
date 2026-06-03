use crate::agent::session::{Session, Message, session_from_row, message_from_row, db::DbState};
use tauri::State;

#[tauri::command]
pub fn get_sessions(db: State<DbState>) -> Result<Vec<Session>, String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC")
        .map_err(|e| format!("准备查询失败: {}", e))?;

    let sessions = stmt
        .query_map([], session_from_row)
        .map_err(|e| format!("查询会话失败: {}", e))?
        .filter_map(|s| s.ok())
        .collect();

    Ok(sessions)
}

#[tauri::command]
pub fn get_session(session_id: String, db: State<DbState>) -> Result<Option<Session>, String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT id, title, created_at, updated_at FROM sessions WHERE id = ?1")
        .map_err(|e| format!("准备查询失败: {}", e))?;

    let mut rows = stmt
        .query_map([session_id], session_from_row)
        .map_err(|e| format!("查询会话失败: {}", e))?;

    match rows.next() {
        Some(Ok(s)) => Ok(Some(s)),
        Some(Err(e)) => Err(format!("解析行失败: {}", e)),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn get_messages(session_id: String, db: State<DbState>) -> Result<Vec<Message>, String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
    let mut stmt = conn
        .prepare("SELECT id, session_id, role, content, created_at FROM messages WHERE session_id = ?1 ORDER BY created_at ASC")
        .map_err(|e| format!("准备查询失败: {}", e))?;

    let messages = stmt
        .query_map([session_id], message_from_row)
        .map_err(|e| format!("查询消息失败: {}", e))?
        .filter_map(|m| m.ok())
        .collect();

    Ok(messages)
}

#[tauri::command]
pub fn search_sessions(keyword: String, db: State<DbState>) -> Result<Vec<Session>, String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
    let pattern = format!("%{}%", keyword);
    let mut stmt = conn
        .prepare("SELECT id, title, created_at, updated_at FROM sessions WHERE title LIKE ?1 ORDER BY updated_at DESC")
        .map_err(|e| format!("准备查询失败: {}", e))?;

    let sessions = stmt
        .query_map([pattern], session_from_row)
        .map_err(|e| format!("搜索会话失败: {}", e))?
        .filter_map(|s| s.ok())
        .collect();

    Ok(sessions)
}
