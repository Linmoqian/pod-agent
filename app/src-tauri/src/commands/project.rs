use tauri::State;

use crate::domain::{Project, ProjectOverview, WorkspaceSnapshot};
use crate::error::{AppError, AppResult};
use crate::services::{db, research, storage};
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
pub fn list_projects(state: State<'_, AppState>) -> AppResult<Vec<Project>> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
    let mut statement = connection
        .prepare(
            "SELECT id,name,status,created_at,updated_at FROM projects ORDER BY updated_at DESC",
        )
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    let rows = statement
        .query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                status: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))
}

#[tauri::command]
pub fn create_project(name: String, state: State<'_, AppState>) -> AppResult<Project> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::new("PROJECT_NAME_REQUIRED", "项目名称不能为空"));
    }
    let project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.into(),
        status: "active".into(),
        created_at: db::now(),
        updated_at: db::now(),
    };
    let connection = state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
    connection
        .execute(
            "INSERT INTO projects(id,name,status,created_at,updated_at) VALUES(?1,?2,?3,?4,?5)",
            rusqlite::params![
                project.id,
                project.name,
                project.status,
                project.created_at,
                project.updated_at
            ],
        )
        .map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    storage::ensure_project_dirs(&state.data_root, &project.id)?;
    Ok(project)
}

#[tauri::command]
pub fn update_project(
    project_id: String,
    name: String,
    state: State<'_, AppState>,
) -> AppResult<Project> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::new("PROJECT_NAME_REQUIRED", "项目名称不能为空"));
    }
    let connection = state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
    connection
        .execute(
            "UPDATE projects SET name=?1,updated_at=?2 WHERE id=?3",
            rusqlite::params![name, db::now(), project_id],
        )
        .map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    db::project(&connection, &project_id)
}

#[tauri::command]
pub fn archive_project(project_id: String, state: State<'_, AppState>) -> AppResult<Project> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
    connection
        .execute(
            "UPDATE projects SET status='archived',updated_at=?1 WHERE id=?2",
            rusqlite::params![db::now(), project_id],
        )
        .map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    db::project(&connection, &project_id)
}

#[tauri::command]
pub fn get_project_overview(
    project_id: String,
    state: State<'_, AppState>,
) -> AppResult<ProjectOverview> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
    research::overview(&connection, &project_id)
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
        overview: research::overview(&connection, &project_id)?,
        datasets: db::datasets(&connection, &project_id)?,
        schemas: research::schemas(&connection, &project_id)?,
        materials: research::materials(&connection, &project_id)?,
        traits: research::traits(&connection, &project_id)?,
        environments: research::environments(&connection, &project_id)?,
        artifacts: db::artifacts(&connection, &project_id)?,
        task_plans: db::plans(&connection, &project_id)?,
        task_plan_runs: research::task_plan_runs(&connection, &project_id)?,
        executions: research::executions(&connection, &project_id)?,
        workflow_runs: db::runs(&connection, &project_id)?,
        messages: db::messages(&connection, &project_id)?,
    })
}
