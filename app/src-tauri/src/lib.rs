mod config;
mod agent;

use config::{save_llm_config, load_llm_config, get_llm_config_path, LLMConfig};
use agent::session::{
    create_session, create_message,
    delete_session, delete_message,
    get_sessions, get_session, get_messages, search_sessions,
    update_session_title, update_session_timestamp,
};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            save_llm_config,
            load_llm_config,
            get_llm_config_path,
            create_session,
            create_message,
            delete_session,
            delete_message,
            get_sessions,
            get_session,
            get_messages,
            search_sessions,
            update_session_title,
            update_session_timestamp,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
