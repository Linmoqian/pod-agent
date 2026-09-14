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
            services::yolo::yolo_detect_image,
            services::yolo::yolo_models,
            services::yolo::yolo_thumbnail,
            commands::conversation::ensure_active_conversation,
            commands::conversation::get_conversation_context,
            commands::conversation::open_project_context,
            commands::conversation::new_temporary_conversation,
            commands::conversation::send_message,
            commands::conversation::promote_conversation,
            commands::project::ensure_draft_project,
            commands::project::list_projects,
            commands::project::create_project,
            commands::project::update_project,
            commands::project::archive_project,
            commands::project::get_project_overview,
            commands::import::inspect_data_sources,
            commands::import::register_datasets,
            commands::import::confirm_data_import,
            commands::workflow::submit_agent_intent,
            commands::workflow::submit_research_intent,
            commands::workflow::confirm_task_plan,
            commands::workflow::start_task_plan_run,
            commands::workflow::cancel_workflow,
            commands::project::get_workspace_snapshot,
            commands::artifacts::get_artifact_detail,
            commands::research::list_materials,
            commands::research::get_material_context,
            commands::research::list_traits,
            commands::research::list_environments,
            commands::research::get_execution_detail,
            commands::research::get_lineage_subgraph
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
