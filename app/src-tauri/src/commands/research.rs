// M2 科研实体、Execution 与血缘 IPC 边界。
// Created on 2026-09-12
// @author: https://github.com/Linmoqian

use tauri::State;

use crate::domain::{
    Environment, Execution, LineageSubgraph, Material, MaterialContext, TraitDefinition,
};
use crate::error::{AppError, AppResult};
use crate::services::research;
use crate::state::AppState;

fn connection<'a>(
    state: &'a State<'_, AppState>,
) -> AppResult<std::sync::MutexGuard<'a, rusqlite::Connection>> {
    state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))
}

#[tauri::command]
pub fn list_materials(project_id: String, state: State<'_, AppState>) -> AppResult<Vec<Material>> {
    let connection = connection(&state)?;
    research::materials(&connection, &project_id)
}

#[tauri::command]
pub fn get_material_context(
    material_id: String,
    state: State<'_, AppState>,
) -> AppResult<MaterialContext> {
    let connection = connection(&state)?;
    research::material_context(&connection, &material_id)
}

#[tauri::command]
pub fn list_traits(
    project_id: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<TraitDefinition>> {
    let connection = connection(&state)?;
    research::traits(&connection, &project_id)
}

#[tauri::command]
pub fn list_environments(
    project_id: String,
    state: State<'_, AppState>,
) -> AppResult<Vec<Environment>> {
    let connection = connection(&state)?;
    research::environments(&connection, &project_id)
}

#[tauri::command]
pub fn get_execution_detail(
    execution_id: String,
    state: State<'_, AppState>,
) -> AppResult<Execution> {
    let connection = connection(&state)?;
    research::execution(&connection, &execution_id)
}

#[tauri::command]
pub fn get_lineage_subgraph(
    kind: String,
    id: String,
    direction: Option<String>,
    max_depth: Option<i64>,
    state: State<'_, AppState>,
) -> AppResult<LineageSubgraph> {
    let connection = connection(&state)?;
    research::lineage(
        &connection,
        &kind,
        &id,
        direction.as_deref().unwrap_or("both"),
        max_depth.unwrap_or(2),
    )
}
