use tauri::State;

use crate::domain::{Project, WorkspaceSnapshot};
use crate::error::{AppError, AppResult};
use crate::services::{db, storage};
use crate::state::AppState;

#[tauri::command]
pub fn ensure_draft_project(
    name_hint: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<Project> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
    let project = db::ensure_draft_project(&connection, name_hint.as_deref())?;
    storage::ensure_project_dirs(&state.data_root, &project.id)?;
    Ok(project)
}

#[tauri::command]
pub fn get_workspace_snapshot(
    project_id: String,
    state: State<'_, AppState>,
) -> AppResult<WorkspaceSnapshot> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
    Ok(WorkspaceSnapshot {
        project: db::project(&connection, &project_id)?,
        datasets: db::datasets(&connection, &project_id)?,
        artifacts: db::artifacts(&connection, &project_id)?,
        task_plans: db::plans(&connection, &project_id)?,
        workflow_runs: db::runs(&connection, &project_id)?,
        messages: db::messages(&connection, &project_id)?,
    })
}
