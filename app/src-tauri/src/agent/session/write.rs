#[tauri::command]
pub fn update_session_title(session_id: String, title: String) -> Result<(), String> {
    // TODO: 实现数据库更新
    println!("更新会话标题: {} -> {}", session_id, title);
    Ok(())
}

#[tauri::command]
pub fn update_session_timestamp(session_id: String) -> Result<(), String> {
    // TODO: 实现数据库更新
    println!("更新会话时间戳: {}", session_id);
    Ok(())
}
