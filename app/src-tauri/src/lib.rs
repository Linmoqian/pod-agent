pub mod api;
pub mod agent;
mod paths;

use api::camera::media::{capture_photo, load_last_photo, list_photos, read_photo_data, get_phenotypes};
use api::camera::stream::{list_cameras, start_camera_preview, stop_camera_preview, set_yolo_detecting};
use api::model::llm::llm_provider::{save_llm_config, load_llm_config, get_llm_config_path, resolve_db_path, test_llm_connection};
use api::model::llm::send::send_llm_message;
use api::model::yolo::detect::{load_yolo_model, unload_yolo_model, detect_photo, detect_from_bytes};
use agent::session::{
    create_session, create_message,
    delete_session, delete_message,
    get_sessions, get_session, get_messages, search_sessions,
    update_session_title, update_session_timestamp,
};
use agent::session::db;
use agent::tool::{invoke_tool, list_tool_calls};

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
        .plugin(tauri_plugin_dialog::init())
        .manage(db_state)
        .manage(std::sync::Mutex::new(api::camera::CameraState::new()))
        .invoke_handler(tauri::generate_handler![
            greet,
            paths::get_data_dir_cmd,
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
            list_cameras,
            start_camera_preview,
            stop_camera_preview,
            set_yolo_detecting,
            capture_photo,
            load_last_photo,
            list_photos,
            read_photo_data,
            get_phenotypes,
            load_yolo_model,
            unload_yolo_model,
            detect_photo,
            detect_from_bytes,
            invoke_tool,
            list_tool_calls,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
