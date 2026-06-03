mod api;
mod agent;

use api::model::llm::llm_provider::{save_llm_config, load_llm_config, get_llm_config_path, resolve_db_path, test_llm_connection};
use api::model::llm::send::send_llm_message;
use agent::session::{
    create_session, create_message,
    delete_session, delete_message,
    get_sessions, get_session, get_messages, search_sessions,
    update_session_title, update_session_timestamp,
};
use agent::session::db;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = load_llm_config().unwrap_or_default();
    let db_path = resolve_db_path(&config);
    let db_state = db::init_db(&db_path).expect("初始化会话数据库失败");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .manage(db_state)
        .invoke_handler(tauri::generate_handler![
            greet,
            save_llm_config,
            load_llm_config,
            get_llm_config_path,
            test_llm_connection,
            send_llm_message,
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
