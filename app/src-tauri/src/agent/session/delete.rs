#[tauri::command]
pub fn delete_session(session_id: String) -> Result<(), String> {
    // TODO: 实现数据库删除
    println!("删除会话: {}", session_id);
    Ok(())
}

#[tauri::command]
pub fn delete_message(message_id: String) -> Result<(), String> {
    // TODO: 实现数据库删除
    println!("删除消息: {}", message_id);
    Ok(())
}
