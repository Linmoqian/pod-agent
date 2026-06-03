use crate::agent::session::db::DbState;
use tauri::State;

#[tauri::command]
pub fn delete_session(session_id: String, db: State<DbState>) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
    conn.execute("DELETE FROM messages WHERE session_id = ?1", [&session_id])
        .map_err(|e| format!("删除消息失败: {}", e))?;
    conn.execute("DELETE FROM sessions WHERE id = ?1", [&session_id])
        .map_err(|e| format!("删除会话失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn delete_message(message_id: String, db: State<DbState>) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
    conn.execute("DELETE FROM messages WHERE id = ?1", [&message_id])
        .map_err(|e| format!("删除消息失败: {}", e))?;
    Ok(())
}
