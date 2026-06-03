use crate::agent::session::{Session, Message};
use uuid::Uuid;
use chrono::Local;

#[tauri::command]
pub fn create_session(title: String) -> Session {
    Session {
        id: Uuid::new_v4().to_string(),
        title,
        created_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        updated_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    }
}

#[tauri::command]
pub fn create_message(session_id: String, role: String, content: String) -> Message {
    Message {
        id: Uuid::new_v4().to_string(),
        session_id,
        role,
        content,
        created_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    }
}
