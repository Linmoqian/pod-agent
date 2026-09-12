use tauri::State;

use crate::domain::ArtifactDetail;
use crate::error::{AppError, AppResult};
use crate::services::db;
use crate::state::AppState;

#[tauri::command]
pub fn get_artifact_detail(
    artifact_id: String,
    state: State<'_, AppState>,
) -> AppResult<ArtifactDetail> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
    let (artifact, dataset_id) = db::artifact(&connection, &artifact_id)?;
    let upstream = artifact
        .upstream_ids
        .iter()
        .filter_map(|id| db::artifact(&connection, id).ok().map(|value| value.0))
        .collect();
    let dataset = dataset_id.and_then(|id| db::dataset(&connection, &id).ok().map(|value| value.0));
    let tool_runs = artifact
        .produced_by_run_id
        .as_deref()
        .map(|run_id| db::tool_runs(&connection, run_id))
        .transpose()?
        .unwrap_or_default();
    Ok(ArtifactDetail {
        artifact,
        upstream,
        dataset,
        tool_runs,
    })
}
