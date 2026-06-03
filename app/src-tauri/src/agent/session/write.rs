use crate::agent::session::db::DbState;
use chrono::Local;
use tauri::State;

#[tauri::command]
pub fn update_session_title(
    session_id: String,
    title: String,
    db: State<DbState>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE sessions SET title = ?1, updated_at = ?2 WHERE id = ?3",
        [&title, &now, &session_id],
    )
    .map_err(|e| format!("更新标题失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn update_session_timestamp(
    session_id: String,
    db: State<DbState>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
        [&now, &session_id],
    )
    .map_err(|e| format!("更新时间戳失败: {}", e))?;
    Ok(())
}
