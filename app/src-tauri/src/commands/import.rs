use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use tauri::{Emitter, State};

use crate::domain::{
    Artifact, ArtifactFile, Dataset, IdentityResolution, ImportInspection, LifecycleEvent,
    SemanticImportInspection, SourceCandidate,
};
use crate::error::{AppError, AppResult};
use crate::services::{db, research, storage, tools, worker};
use crate::state::AppState;

const MAX_IMPORT_FILES: usize = 100;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetRegistration {
    pub source_id: String,
    #[serde(default)]
    pub mapping: Value,
    #[serde(default)]
    pub material_resolutions: BTreeMap<String, String>,
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
) -> AppResult<SemanticImportInspection> {
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
                    material_values: vec![],
                    environment_values: vec![],
                    identity_suggestions: vec![],
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
            let material_values: Vec<String> =
                serde_json::from_value(inspected["materialValues"].clone()).unwrap_or_default();
            let identity_suggestions = research::material_suggestions(
                &connection,
                &project_id_for_task,
                &material_values,
            )?;
            let mut ambiguities: Vec<String> =
                serde_json::from_value(inspected["ambiguities"].clone()).unwrap_or_default();
            let mappings = inspected["inferredMapping"].as_object();
            if mappings.is_some_and(|items| {
                items.values().any(|mapping| mapping["unit"].is_null())
            }) {
                ambiguities.push("单位缺失；确认即按“未知单位”登记，QC 将标记为 warn".into());
            }
            for suggestion in &identity_suggestions {
                ambiguities.push(format!(
                    "材料 {} 可能对应已有材料 {}，需确认后才会合并",
                    suggestion["sourceValue"].as_str().unwrap_or("—"),
                    suggestion["targetCode"].as_str().unwrap_or("—")
                ));
            }
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
                ambiguities,
                supported: true,
                material_values,
                environment_values: serde_json::from_value(
                    inspected["environmentValues"].clone(),
                )
                .unwrap_or_default(),
                identity_suggestions,
            });
        }
        let import_session_id = uuid::Uuid::new_v4().to_string();
        let inspection = ImportInspection {
            project_id: project_id_for_task,
            import_session_id: import_session_id.clone(),
            candidates,
        };
        connection.execute(
            "INSERT INTO import_sessions(id,project_id,inspection_json,status,created_at) VALUES(?1,?2,?3,'pending',?4)",
            rusqlite::params![import_session_id,inspection.project_id,serde_json::to_string(&inspection).unwrap_or_default(),db::now()],
        ).map_err(|error| AppError::new("DB_WRITE_FAILED",error.to_string()))?;
        Ok(inspection)
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
        let mut connection = db::open(&root.join("lian.db"))?;
        let project_dir = storage::ensure_project_dirs(&root, &project_id_for_task)?;
        let mut created = Vec::new();
        for registration in registrations {
            let source_project: String = connection.query_row(
                "SELECT project_id FROM source_files WHERE id=?1",
                [&registration.source_id],
                |row| row.get(0),
            ).map_err(|_| AppError::new("SOURCE_NOT_FOUND", "数据源不存在"))?;
            if source_project != project_id_for_task {
                return Err(AppError::new("SOURCE_PROJECT_MISMATCH", "数据源不属于当前 Project"));
            }
            let source = db::source(&connection, &registration.source_id)?;
            let dataset_id = uuid::Uuid::new_v4().to_string();
            let dataset_dir = project_dir.join("datasets").join(&dataset_id).join("v1");
            let config = write_config(&dataset_dir, &json!({"sourcePath":&source.managed_path,"outputDir":&dataset_dir,"mapping":registration.mapping}))?;
            let normalized = worker::run("normalize", &config)?;
            let quality = normalized["quality"].clone();
            let quality_tool = tools::get("data.quality_check")?;
            let transaction = connection
                .transaction()
                .map_err(|error| AppError::new("DB_TRANSACTION_FAILED", error.to_string()))?;
            let mut semantic = research::semanticize_dataset(
                &transaction,
                &project_id_for_task,
                &normalized,
                &registration.material_resolutions,
            )?;
            semantic.metadata["qualityStatus"] = quality["status"].clone();
            let dataset_name = Path::new(&source.original_name).file_stem().and_then(|value| value.to_str()).unwrap_or("表型数据");
            let dataset = Dataset { id: dataset_id.clone(), project_id: project_id_for_task.clone(), name: dataset_name.into(), dataset_type: "phenotype".into(), version: 1, schema: semantic.schema.clone(), source: db::source_json(&source), metadata: semantic.metadata.clone(), quality_status: quality["status"].as_str().unwrap_or("warn").into(), supersedes_id: None, created_at: db::now() };
            db::insert_dataset(&transaction, &dataset, &semantic.canonical_path)?;
            research::register_dataset_version(&transaction,&dataset.id,&project_id_for_task,dataset_name,&source.id,&semantic)?;
            let artifact_id = uuid::Uuid::new_v4().to_string();
            let artifact_dir = project_dir.join("artifacts").join(&artifact_id);
            std::fs::create_dir_all(&artifact_dir).map_err(|error| AppError::new("STORAGE_CREATE_FAILED", error.to_string()))?;
            std::fs::copy(dataset_dir.join("quality.json"), artifact_dir.join("quality.json")).map_err(|error| AppError::new("STORAGE_WRITE_FAILED", error.to_string()))?;
            let files = artifact_files(&artifact_dir, &["quality.json"])?;
            let artifact = Artifact { id: artifact_id, project_id: project_id_for_task.clone(), artifact_type: "quality.report".into(), name: format!("{} 数据质量报告", dataset.name), status: dataset.quality_status.clone(), checksum: files[0].checksum.clone(), files, upstream_ids: vec![dataset.id.clone()], produced_by_run_id: None, metadata: json!({"summary":quality,"tool":quality_tool}), created_at: db::now() };
            db::insert_artifact(&transaction, &artifact, Some(&dataset.id), &artifact_dir.to_string_lossy())?;
            transaction.commit().map_err(|error| AppError::new("DB_TRANSACTION_FAILED", error.to_string()))?;
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmImportRequest {
    pub import_session_id: String,
    pub registrations: Vec<DatasetRegistration>,
    #[serde(default)]
    pub resolutions: Vec<IdentityResolution>,
}

#[tauri::command]
pub async fn confirm_data_import(
    project_id: String,
    request: ConfirmImportRequest,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Vec<Dataset>> {
    let root = state.data_root.clone();
    {
        let connection = state
            .connection
            .lock()
            .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
        let (owner, inspection_json): (String, String) = connection
            .query_row(
                "SELECT project_id,inspection_json FROM import_sessions WHERE id=?1 AND status='pending'",
                [&request.import_session_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| AppError::new("IMPORT_SESSION_INVALID", "导入会话不存在或已经完成"))?;
        if owner != project_id {
            return Err(AppError::new(
                "IMPORT_PROJECT_MISMATCH",
                "导入会话不属于当前 Project",
            ));
        }
        let inspection: ImportInspection = serde_json::from_str(&inspection_json)
            .map_err(|error| AppError::new("IMPORT_SESSION_INVALID", error.to_string()))?;
        let unresolved = inspection
            .candidates
            .iter()
            .flat_map(|candidate| candidate.identity_suggestions.iter())
            .filter_map(|suggestion| suggestion["sourceValue"].as_str())
            .filter(|source| {
                !request
                    .resolutions
                    .iter()
                    .any(|item| item.entity_kind == "material" && item.source_value == *source)
                    && !request
                        .registrations
                        .iter()
                        .any(|item| item.material_resolutions.contains_key(*source))
            })
            .collect::<Vec<_>>();
        if !unresolved.is_empty() {
            return Err(AppError::new(
                "IDENTITY_RESOLUTION_REQUIRED",
                format!("仍有 {} 个材料身份建议未确认", unresolved.len()),
            ));
        }
    }
    let session_id = request.import_session_id;
    let material_resolutions = request
        .resolutions
        .into_iter()
        .filter(|item| item.entity_kind == "material")
        .map(|item| {
            let target = if item.choice == "link" {
                item.target_id.unwrap_or_else(|| "new".into())
            } else {
                "new".into()
            };
            (item.source_value, target)
        })
        .collect::<BTreeMap<_, _>>();
    let registrations = request
        .registrations
        .into_iter()
        .map(|mut item| {
            item.material_resolutions
                .extend(material_resolutions.clone());
            item
        })
        .collect();
    let datasets = register_datasets(project_id, registrations, app, state).await?;
    let connection = db::open(&root.join("lian.db"))?;
    connection
        .execute(
            "UPDATE import_sessions SET status='completed',completed_at=?1 WHERE id=?2",
            rusqlite::params![db::now(), session_id],
        )
        .map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok(datasets)
}
