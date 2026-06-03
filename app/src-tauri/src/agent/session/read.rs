use crate::agent::session::{Session, Message};

#[tauri::command]
pub fn get_sessions() -> Vec<Session> {
    // TODO: 实现数据库查询
    vec![]
}

#[tauri::command]
pub fn get_session(session_id: String) -> Option<Session> {
    // TODO: 实现数据库查询
    println!("获取会话: {}", session_id);
    None
}

#[tauri::command]
pub fn get_messages(session_id: String) -> Vec<Message> {
    // TODO: 实现数据库查询
    println!("获取会话消息: {}", session_id);
    vec![]
}

#[tauri::command]
pub fn search_sessions(keyword: String) -> Vec<Session> {
    // TODO: 实现数据库搜索
    println!("搜索会话: {}", keyword);
    vec![]
}
