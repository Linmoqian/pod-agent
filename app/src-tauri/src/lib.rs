mod commands;
mod domain;
mod error;
mod services;
mod state;

use tauri::Manager;

use state::AppState;

// 应用组装入口：IPC 是前端访问科研数据与工作流的唯一边界。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_root = app
                .path()
                .app_data_dir()
                .map_err(|error| Box::<dyn std::error::Error>::from(error.to_string()))?;
            let connection = services::db::open(&data_root.join("lian.db"))
                .map_err(|error| Box::<dyn std::error::Error>::from(error.message))?;
            services::db::recover_interrupted_runs(&connection)
                .map_err(|error| Box::<dyn std::error::Error>::from(error.message))?;
            app.manage(AppState::new(data_root, connection));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::project::ensure_draft_project,
            commands::import::inspect_data_sources,
            commands::import::register_datasets,
            commands::workflow::submit_agent_intent,
            commands::workflow::confirm_task_plan,
            commands::workflow::cancel_workflow,
            commands::project::get_workspace_snapshot,
            commands::artifacts::get_artifact_detail
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
