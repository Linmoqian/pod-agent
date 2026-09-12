use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use tauri::{Emitter, State};

use crate::domain::{
    Artifact, ArtifactFile, Dataset, ImportInspection, LifecycleEvent, SourceCandidate,
};
use crate::error::{AppError, AppResult};
use crate::services::{db, storage, worker};
use crate::state::AppState;

const MAX_IMPORT_FILES: usize = 100;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetRegistration {
    pub source_id: String,
    #[serde(default)]
    pub mapping: Value,
}

fn emit(app: &tauri::AppHandle, project_id: &str, event_type: &str, payload: Value) {
    let _ = app.emit(
        "lian-import-event",
        LifecycleEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            project_id: project_id.into(),
            task_id: None,
            run_id: None,
            timestamp: db::now(),
            event_type: event_type.into(),
            payload,
        },
    );
}

fn collect_files(paths: &[String]) -> AppResult<Vec<PathBuf>> {
    let mut files = BTreeSet::new();
    let mut pending: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
    while let Some(path) = pending.pop() {
        let metadata = std::fs::symlink_metadata(&path)
            .map_err(|_| AppError::new("SOURCE_NOT_FOUND", "选择的数据源不存在"))?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            for entry in std::fs::read_dir(&path)
                .map_err(|error| AppError::new("SOURCE_READ_FAILED", error.to_string()))?
            {
                let entry = entry
                    .map_err(|error| AppError::new("SOURCE_READ_FAILED", error.to_string()))?;
                if !entry.file_name().to_string_lossy().starts_with('.') {
                    pending.push(entry.path());
                }
            }
        } else if metadata.is_file() {
            files.insert(path);
            if files.len() > MAX_IMPORT_FILES {
                return Err(AppError::new("IMPORT_TOO_LARGE", "单次最多检查 100 个文件"));
            }
        }
    }
    Ok(files.into_iter().collect())
}

fn supported_format(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .filter(|value| ["csv", "tsv", "txt", "xlsx"].contains(&value.as_str()))
}

fn write_config(directory: &Path, value: &Value) -> AppResult<PathBuf> {
    std::fs::create_dir_all(directory)
        .map_err(|error| AppError::new("STORAGE_CREATE_FAILED", error.to_string()))?;
    let path = directory.join("worker-config.json");
    std::fs::write(&path, value.to_string())
        .map_err(|error| AppError::new("STORAGE_WRITE_FAILED", error.to_string()))?;
    Ok(path)
}

fn artifact_files(directory: &Path, names: &[&str]) -> AppResult<Vec<ArtifactFile>> {
    names
        .iter()
        .map(|name| {
            let path = directory.join(name);
            Ok(ArtifactFile {
                name: (*name).into(),
                content_type: match path.extension().and_then(|value| value.to_str()) {
                    Some("json") => "application/json",
                    Some("csv") => "text/csv",
                    Some("md") => "text/markdown",
                    Some("png") => "image/png",
                    _ => "application/octet-stream",
                }
                .into(),
                size: std::fs::metadata(&path)
                    .map_err(|error| AppError::new("ARTIFACT_FILE_MISSING", error.to_string()))?
                    .len(),
                checksum: storage::sha256_file(&path)?,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn inspect_data_sources(
    project_id: String,
    paths: Vec<String>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<ImportInspection> {
    if paths.is_empty() {
        return Err(AppError::new("EMPTY_IMPORT", "请选择文件或文件夹"));
    }
    let root = state.data_root.clone();
    let project_id_for_task = project_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let files = collect_files(&paths)?;
        let project_dir = storage::ensure_project_dirs(&root, &project_id_for_task)?;
        let connection = db::open(&root.join("lian.db"))?;
        db::project(&connection, &project_id_for_task)?;
        let mut candidates = Vec::new();
        for path in files {
            let name = storage::safe_file_name(&path);
            let Some(format) = supported_format(&path) else {
                candidates.push(SourceCandidate {
                    source_id: String::new(),
                    name,
                    format: path
                        .extension()
                        .and_then(|value| value.to_str())
                        .unwrap_or("unknown")
                        .into(),
                    size: std::fs::metadata(&path).map(|item| item.len()).unwrap_or(0),
                    checksum: String::new(),
                    sheets: vec![],
                    row_count: 0,
                    columns: vec![],
                    inferred_mapping: Value::Null,
                    traits: vec![],
                    ambiguities: vec!["当前 V1 尚无此格式的 Data Adapter".into()],
                    supported: false,
                });
                continue;
            };
            let checksum = storage::sha256_file(&path)?;
            let size = std::fs::metadata(&path)
                .map_err(|error| AppError::new("SOURCE_READ_FAILED", error.to_string()))?
                .len();
            let record = if let Some(existing) =
                db::find_source(&connection, &project_id_for_task, &checksum)?
            {
                existing
            } else {
                let id = uuid::Uuid::new_v4().to_string();
                let destination = project_dir
                    .join("sources")
                    .join(format!("{checksum}.{format}"));
                storage::copy_immutable(&path, &destination)?;
                let record = db::SourceRecord {
                    id,
                    original_name: name.clone(),
                    managed_path: destination.to_string_lossy().into(),
                    format: format.clone(),
                    sha256: checksum.clone(),
                    size,
                };
                db::insert_source(&connection, &project_id_for_task, &record)?;
                record
            };
            let config_dir = project_dir
                .join("runs")
                .join(format!("inspect-{}", record.id));
            let config = write_config(&config_dir, &json!({"sourcePath":&record.managed_path}))?;
            let inspected = worker::run("inspect", &config)?;
            candidates.push(SourceCandidate {
                source_id: record.id,
                name: record.original_name,
                format: record.format,
                size: record.size,
                checksum: record.sha256,
                sheets: serde_json::from_value(inspected["sheets"].clone()).unwrap_or_default(),
                row_count: inspected["rowCount"].as_u64().unwrap_or(0) as usize,
                columns: serde_json::from_value(inspected["columns"].clone()).unwrap_or_default(),
                inferred_mapping: inspected["inferredMapping"].clone(),
                traits: serde_json::from_value(inspected["traits"].clone()).unwrap_or_default(),
                ambiguities: serde_json::from_value(inspected["ambiguities"].clone())
                    .unwrap_or_default(),
                supported: true,
            });
        }
        Ok(ImportInspection {
            project_id: project_id_for_task,
            candidates,
        })
    })
    .await
    .map_err(|error| AppError::retryable("IMPORT_TASK_FAILED", error.to_string()))??;
    emit(
        &app,
        &project_id,
        "import.inspected",
        json!({"candidateCount":result.candidates.len()}),
    );
    Ok(result)
}

#[tauri::command]
pub async fn register_datasets(
    project_id: String,
    registrations: Vec<DatasetRegistration>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Vec<Dataset>> {
    let root = state.data_root.clone();
    let project_id_for_task = project_id.clone();
    let datasets = tauri::async_runtime::spawn_blocking(move || {
        let connection = db::open(&root.join("lian.db"))?;
        let project_dir = storage::ensure_project_dirs(&root, &project_id_for_task)?;
        let mut created = Vec::new();
        for registration in registrations {
            let source = db::source(&connection, &registration.source_id)?;
            let dataset_id = uuid::Uuid::new_v4().to_string();
            let dataset_dir = project_dir.join("datasets").join(&dataset_id).join("v1");
            let config = write_config(&dataset_dir, &json!({"sourcePath":&source.managed_path,"outputDir":&dataset_dir,"mapping":registration.mapping}))?;
            let normalized = worker::run("normalize", &config)?;
            let quality = normalized["quality"].clone();
            let dataset = Dataset { id: dataset_id.clone(), project_id: project_id_for_task.clone(), name: Path::new(&source.original_name).file_stem().and_then(|value| value.to_str()).unwrap_or("表型数据").into(), dataset_type: "phenotype".into(), version: 1, schema: normalized["schema"].clone(), source: db::source_json(&source), metadata: normalized["metadata"].clone(), quality_status: quality["status"].as_str().unwrap_or("warn").into(), supersedes_id: None, created_at: db::now() };
            db::insert_dataset(&connection, &dataset, normalized["canonicalPath"].as_str().ok_or_else(|| AppError::new("WORKER_PROTOCOL_ERROR", "缺少规范化数据路径"))?)?;
            let artifact_id = uuid::Uuid::new_v4().to_string();
            let artifact_dir = project_dir.join("artifacts").join(&artifact_id);
            std::fs::create_dir_all(&artifact_dir).map_err(|error| AppError::new("STORAGE_CREATE_FAILED", error.to_string()))?;
            std::fs::copy(dataset_dir.join("quality.json"), artifact_dir.join("quality.json")).map_err(|error| AppError::new("STORAGE_WRITE_FAILED", error.to_string()))?;
            let files = artifact_files(&artifact_dir, &["quality.json"])?;
            let artifact = Artifact { id: artifact_id, project_id: project_id_for_task.clone(), artifact_type: "quality.report".into(), name: format!("{} 数据质量报告", dataset.name), status: dataset.quality_status.clone(), checksum: files[0].checksum.clone(), files, upstream_ids: vec![dataset.id.clone()], produced_by_run_id: None, metadata: quality, created_at: db::now() };
            db::insert_artifact(&connection, &artifact, Some(&dataset.id), &artifact_dir.to_string_lossy())?;
            created.push(dataset);
        }
        Ok(created)
    }).await.map_err(|error| AppError::retryable("REGISTER_TASK_FAILED", error.to_string()))??;
    emit(
        &app,
        &project_id,
        "dataset.registered",
        json!({"datasetCount":datasets.len()}),
    );
    Ok(datasets)
}
