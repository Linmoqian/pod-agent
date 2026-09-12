use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{Emitter, State};

use crate::domain::{
    Artifact, ArtifactFile, EntityRef, LifecycleEvent, PlanStep, TaskPlan, WorkflowRun,
};
use crate::error::{AppError, AppResult};
use crate::services::{db, planner, storage, tools, worker};
use crate::state::AppState;

fn emit(
    app: &tauri::AppHandle,
    plan: &TaskPlan,
    run_id: Option<&str>,
    event_type: &str,
    payload: Value,
) {
    let _ = app.emit(
        if run_id.is_some() {
            "lian-workflow-event"
        } else {
            "lian-agent-event"
        },
        LifecycleEvent {
            event_id: uuid::Uuid::new_v4().to_string(),
            project_id: plan.project_id.clone(),
            task_id: Some(plan.id.clone()),
            run_id: run_id.map(str::to_string),
            timestamp: db::now(),
            event_type: event_type.into(),
            payload,
        },
    );
}

fn choose_trait(schema: &Value, intent: &str) -> AppResult<String> {
    let traits = schema["traits"].as_array().cloned().unwrap_or_default();
    traits
        .iter()
        .find(|item| {
            item["id"].as_str().is_some_and(|id| intent.contains(id))
                || item["name"]
                    .as_str()
                    .is_some_and(|name| intent.contains(name))
        })
        .or_else(|| traits.first())
        .and_then(|item| item["id"].as_str())
        .map(str::to_string)
        .ok_or_else(|| AppError::new("TRAIT_NOT_FOUND", "Dataset 中没有可分析的数值性状"))
}

#[tauri::command]
pub async fn submit_agent_intent(
    project_id: String,
    intent: Option<String>,
    dataset_ids: Vec<String>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<TaskPlan> {
    let dataset = {
        let connection = state
            .connection
            .lock()
            .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
        db::project(&connection, &project_id)?;
        let dataset_id = dataset_ids
            .first()
            .ok_or_else(|| AppError::new("DATASET_REQUIRED", "请先导入一个表型 Dataset"))?;
        db::dataset(&connection, dataset_id)?.0
    };
    if dataset.project_id != project_id {
        return Err(AppError::new(
            "DATASET_PROJECT_MISMATCH",
            "Dataset 不属于当前项目",
        ));
    }
    let intent = intent
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "分析这批多环境表型数据".into());
    let fallback_trait = choose_trait(&dataset.schema, &intent)?;
    let app_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let intent_for_agent = intent.clone();
    let dataset_for_agent = dataset.clone();
    let proposal = tauri::async_runtime::spawn_blocking(move || {
        planner::propose(&app_dir, &intent_for_agent, &dataset_for_agent)
    })
    .await
    .ok()
    .and_then(Result::ok);
    let valid_traits: Vec<&str> = dataset.schema["traits"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|item| item["id"].as_str())
        .collect();
    let (title, trait_id, planner_info) = match proposal {
        Some((proposal, model)) if valid_traits.contains(&proposal.trait_id.as_str()) => (
            proposal.title,
            proposal.trait_id,
            json!({"mode":"model","model":model,"summary":proposal.summary}),
        ),
        _ => (
            format!("{fallback_trait} 多环境表型分析"),
            fallback_trait,
            json!({"mode":"deterministic_fallback","model":null}),
        ),
    };
    let plan = TaskPlan {
        id: uuid::Uuid::new_v4().to_string(),
        project_id,
        dataset_id: dataset.id.clone(),
        title,
        goal: intent.clone(),
        intent,
        inputs: vec![EntityRef {
            kind: "datasetVersion".into(),
            id: dataset.id.clone(),
        }],
        risks: vec!["模型设定属于科研判断；M2 不自动剔除异常值".into()],
        trait_id: trait_id.clone(),
        planner: planner_info,
        model_spec: json!({
            "method":"REML",
            "fixedEffects":["environment_id"],
            "randomEffects":["material_id","material_id:environment_id","environment_id:block_id (存在时)"],
            "outlierPolicy":"仅标记，不自动排除"
        }),
        expected_artifacts: vec![
            "model.fit".into(),
            "breeding.blup".into(),
            "breeding.gxe".into(),
            "report.analysis".into(),
        ],
        status: "awaiting_confirmation".into(),
        steps: vec![
            PlanStep {
                id: "quality".into(),
                tool_id: "data.quality_check".into(),
                title: "核对数据质量".into(),
                status: "ready".into(),
                risk_level: "read_only".into(),
                depends_on: vec![],
                parameters: json!({}),
                expected_artifacts: vec!["quality.report".into()],
            },
            PlanStep {
                id: "model".into(),
                tool_id: "breeding.multi_environment_blup".into(),
                title: "拟合混合模型与 BLUP".into(),
                status: "waiting".into(),
                risk_level: "scientific_judgment".into(),
                depends_on: vec!["quality".into()],
                parameters: json!({"traitId": trait_id}),
                expected_artifacts: vec![
                    "model.fit".into(),
                    "breeding.blup".into(),
                    "breeding.gxe".into(),
                ],
            },
            PlanStep {
                id: "report".into(),
                tool_id: "report.compose".into(),
                title: "生成可追溯报告".into(),
                status: "waiting".into(),
                risk_level: "read_only".into(),
                depends_on: vec!["model".into()],
                parameters: json!({}),
                expected_artifacts: vec!["report.analysis".into()],
            },
        ],
        created_at: db::now(),
    };
    let connection = state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
    db::insert_plan(&connection, &plan)?;
    db::insert_message(
        &connection,
        &plan.project_id,
        Some(&plan.id),
        "user",
        &plan.intent,
    )?;
    db::insert_message(
        &connection,
        &plan.project_id,
        Some(&plan.id),
        "assistant",
        &format!("已建立任务：{}；等待确认后执行。", plan.title),
    )?;
    emit(
        &app,
        &plan,
        None,
        "task.plan.created",
        json!({"status":plan.status}),
    );
    Ok(plan)
}

#[tauri::command]
pub async fn submit_research_intent(
    project_id: String,
    intent: Option<String>,
    inputs: Vec<EntityRef>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<TaskPlan> {
    let dataset_ids = {
        let connection = state
            .connection
            .lock()
            .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
        let mut values = Vec::new();
        for input in inputs {
            match input.kind.as_str() {
                "dataset" => values.push(input.id),
                "datasetVersion" => values.push(
                    connection
                        .query_row(
                            "SELECT dataset_id FROM dataset_versions WHERE id=?1 AND project_id=?2",
                            rusqlite::params![input.id, project_id],
                            |row| row.get(0),
                        )
                        .map_err(|_| {
                            AppError::new(
                                "DATASET_VERSION_NOT_FOUND",
                                "DatasetVersion 不存在或不属于当前项目",
                            )
                        })?,
                ),
                _ => {}
            }
        }
        values
    };
    submit_agent_intent(project_id, intent, dataset_ids, app, state).await
}

fn artifact_files(directory: &Path, names: &[String]) -> AppResult<Vec<ArtifactFile>> {
    names
        .iter()
        .map(|name| {
            let path = storage::managed_child_path(directory, name)?;
            let content_type = match path.extension().and_then(|value| value.to_str()) {
                Some("json") => "application/json",
                Some("csv") => "text/csv",
                Some("md") => "text/markdown",
                Some("png") => "image/png",
                _ => "application/octet-stream",
            };
            Ok(ArtifactFile {
                name: name.clone(),
                content_type: content_type.into(),
                size: std::fs::metadata(&path)
                    .map_err(|error| AppError::new("ARTIFACT_FILE_MISSING", error.to_string()))?
                    .len(),
                checksum: storage::sha256_file(&path)?,
            })
        })
        .collect()
}

fn combined_checksum(files: &[ArtifactFile]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    for file in files {
        hasher.update(file.checksum.as_bytes());
    }
    hex::encode(hasher.finalize())
}

const MAX_LOG_BYTES: usize = 10 * 1024 * 1024;

struct WorkerCapture {
    result: AppResult<Value>,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    truncated: bool,
}

fn drain_stream(mut stream: impl Read) -> (Vec<u8>, bool) {
    let mut kept = Vec::new();
    let mut buffer = [0_u8; 8192];
    let mut truncated = false;
    while let Ok(count) = stream.read(&mut buffer) {
        if count == 0 {
            break;
        }
        let remaining = MAX_LOG_BYTES.saturating_sub(kept.len());
        kept.extend_from_slice(&buffer[..count.min(remaining)]);
        truncated |= count > remaining;
    }
    (kept, truncated)
}

fn run_python(config_path: &Path, cancelled: Arc<AtomicBool>) -> AppResult<WorkerCapture> {
    let script = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("python")
        .join("worker.py");
    let mut child = Command::new(worker::python_executable()?)
        .arg(script)
        .arg("analyze")
        .arg(config_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| AppError::new("PYTHON_RUNTIME_UNAVAILABLE", error.to_string()))?;
    let stdout_pipe = child.stdout.take().expect("stdout pipe");
    let stderr_pipe = child.stderr.take().expect("stderr pipe");
    let stdout_handle = std::thread::spawn(move || drain_stream(stdout_pipe));
    let stderr_handle = std::thread::spawn(move || drain_stream(stderr_pipe));
    let mut cancelled_by_user = false;
    loop {
        if cancelled.load(Ordering::Relaxed) {
            let _ = child.kill();
            cancelled_by_user = true;
            break;
        }
        if child
            .try_wait()
            .map_err(|error| AppError::new("WORKER_FAILED", error.to_string()))?
            .is_some()
        {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let status = child
        .wait()
        .map_err(|error| AppError::new("WORKER_FAILED", error.to_string()))?;
    let (stdout_bytes, stdout_truncated) = stdout_handle.join().unwrap_or_default();
    let (stderr_bytes, stderr_truncated) = stderr_handle.join().unwrap_or_default();
    let stdout = String::from_utf8_lossy(&stdout_bytes);
    let payload: Value = stdout
        .lines()
        .rev()
        .find_map(|line| serde_json::from_str(line).ok())
        .unwrap_or(Value::Null);
    let result = if cancelled_by_user {
        Err(AppError::new("WORKFLOW_CANCELLED", "任务已取消"))
    } else if payload.is_null() {
        Err(AppError::new(
            "WORKER_PROTOCOL_ERROR",
            "统计进程未返回有效 JSON",
        ))
    } else if !status.success() || payload["ok"] != Value::Bool(true) {
        Err(AppError::new(
            "ANALYSIS_NOT_IDENTIFIABLE",
            payload["error"].as_str().unwrap_or("统计分析失败"),
        ))
    } else {
        Ok(payload["result"].clone())
    };
    Ok(WorkerCapture {
        result,
        stdout: stdout_bytes,
        stderr: stderr_bytes,
        truncated: stdout_truncated || stderr_truncated,
    })
}

fn execute_workflow(
    root: &Path,
    plan: &TaskPlan,
    run: &WorkflowRun,
    cancelled: Arc<AtomicBool>,
) -> AppResult<Vec<Artifact>> {
    let connection = db::open(&root.join("lian.db"))?;
    let (_, dataset_path) = db::dataset(&connection, &plan.dataset_id)?;
    let project_dir = storage::ensure_project_dirs(root, &plan.project_id)?;
    let output_dir = project_dir.join("runs").join(&run.id).join("outputs");
    std::fs::create_dir_all(&output_dir)
        .map_err(|error| AppError::new("STORAGE_CREATE_FAILED", error.to_string()))?;
    let config_path = project_dir
        .join("runs")
        .join(&run.id)
        .join("analysis-config.json");
    std::fs::write(
        &config_path,
        json!({"datasetPath":dataset_path,"outputDir":output_dir,"traitId":plan.trait_id})
            .to_string(),
    )
    .map_err(|error| AppError::new("STORAGE_WRITE_FAILED", error.to_string()))?;
    let tool = tools::get("breeding.multi_environment_blup")?;
    let tool_run = db::start_tool_run(
        &connection,
        &run.id,
        tool.id,
        tool.version,
        json!({"datasetId":plan.dataset_id,"traitId":plan.trait_id,"modelSpec":plan.model_spec}),
    )?;
    let capture = run_python(&config_path, cancelled)?;
    let run_dir = project_dir.join("runs").join(&run.id);
    let stdout_file = storage::write_managed_log(&run_dir, "stdout.log", &capture.stdout)?;
    let stderr_file = storage::write_managed_log(&run_dir, "stderr.log", &capture.stderr)?;
    db::attach_execution_logs(
        &connection,
        &tool_run,
        &stdout_file,
        &stderr_file,
        capture.truncated,
    )?;
    let result = match capture.result {
        Ok(value) => {
            db::finish_tool_run(
                &connection,
                &tool_run,
                "succeeded",
                value.clone(),
                "[成功] 混合模型收敛并生成结构化输出",
            )?;
            value
        }
        Err(error) => {
            db::finish_tool_run(
                &connection,
                &tool_run,
                "failed",
                json!({"errorCode":error.code}),
                &format!("[错误] {}", error.message),
            )?;
            return Err(error);
        }
    };
    let existing = db::artifacts(&connection, &plan.project_id)?;
    let quality_id = existing
        .iter()
        .find(|item| {
            item.artifact_type == "quality.report" && item.upstream_ids.contains(&plan.dataset_id)
        })
        .map(|item| item.id.clone());
    let mut created = Vec::new();
    let mut ids = HashMap::new();
    let report_tool = tools::get("report.compose")?;
    for descriptor in result["artifacts"].as_array().cloned().unwrap_or_default() {
        let artifact_type = descriptor["type"].as_str().unwrap_or("unknown").to_string();
        let names: Vec<String> =
            serde_json::from_value(descriptor["files"].clone()).unwrap_or_default();
        let artifact_id = uuid::Uuid::new_v4().to_string();
        let artifact_dir = project_dir.join("artifacts").join(&artifact_id);
        std::fs::create_dir_all(&artifact_dir)
            .map_err(|error| AppError::new("STORAGE_CREATE_FAILED", error.to_string()))?;
        for name in &names {
            let source_path = storage::managed_child_path(&output_dir, name)?;
            let destination_path = storage::managed_child_path(&artifact_dir, name)?;
            std::fs::copy(source_path, destination_path)
                .map_err(|error| AppError::new("STORAGE_WRITE_FAILED", error.to_string()))?;
        }
        let files = artifact_files(&artifact_dir, &names)?;
        let upstream_ids = match artifact_type.as_str() {
            "model.fit" => quality_id
                .clone()
                .into_iter()
                .chain(std::iter::once(plan.dataset_id.clone()))
                .collect(),
            "breeding.blup" | "breeding.gxe" => ids.get("model.fit").cloned().into_iter().collect(),
            "report.analysis" => ["breeding.blup", "breeding.gxe"]
                .iter()
                .filter_map(|key| ids.get(*key).cloned())
                .collect(),
            _ => vec![plan.dataset_id.clone()],
        };
        let artifact = Artifact {
            id: artifact_id,
            project_id: plan.project_id.clone(),
            artifact_type: artifact_type.clone(),
            name: descriptor["name"].as_str().unwrap_or("分析结果").into(),
            status: "succeeded".into(),
            checksum: combined_checksum(&files),
            files,
            upstream_ids,
            produced_by_run_id: Some(run.id.clone()),
            metadata: if artifact_type == "model.fit" {
                json!({"diagnostics":result["diagnostics"],"modelSpec":plan.model_spec,"tool":&tool})
            } else {
                let producing_tool = if artifact_type == "report.analysis" {
                    &report_tool
                } else {
                    &tool
                };
                json!({"traitId":plan.trait_id,"tool":producing_tool})
            },
            created_at: db::now(),
        };
        db::insert_artifact(
            &connection,
            &artifact,
            Some(&plan.dataset_id),
            &artifact_dir.to_string_lossy(),
        )?;
        ids.insert(artifact_type, artifact.id.clone());
        created.push(artifact);
    }
    let report_run = db::start_tool_run(
        &connection,
        &run.id,
        report_tool.id,
        report_tool.version,
        json!({"artifactIds":created.iter().map(|item| &item.id).collect::<Vec<_>>() }),
    )?;
    db::finish_tool_run(
        &connection,
        &report_run,
        "succeeded",
        json!({"artifactType":"report.analysis"}),
        "[成功] 报告已生成",
    )?;
    Ok(created)
}

#[tauri::command]
pub async fn confirm_task_plan(
    plan_id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<WorkflowRun> {
    let (plan, run, cancelled) = {
        let connection = state
            .connection
            .lock()
            .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
        let plan = db::plan(&connection, &plan_id)?;
        let (dataset, _) = db::dataset(&connection, &plan.dataset_id)?;
        if dataset.quality_status == "fail" {
            return Err(AppError::new(
                "DATA_QUALITY_BLOCKED",
                "数据质量检查未通过；请先处理主键、标识或单位冲突",
            ));
        }
        if !["awaiting_confirmation", "confirmed"].contains(&plan.status.as_str()) {
            return Err(AppError::new(
                "TASK_PLAN_STATE_INVALID",
                "任务计划当前不可启动",
            ));
        }
        let already_running: bool = connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM task_plan_runs WHERE task_plan_id=?1 AND status='running')",
            [&plan.id],
            |row| row.get(0),
        ).map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
        if already_running {
            return Err(AppError::new(
                "TASK_PLAN_ALREADY_RUNNING",
                "该科研计划已有运行中的实例",
            ));
        }
        let run = WorkflowRun {
            id: uuid::Uuid::new_v4().to_string(),
            task_plan_id: plan.id.clone(),
            project_id: plan.project_id.clone(),
            status: "running".into(),
            error_code: None,
            error_message: None,
            started_at: db::now(),
            finished_at: None,
        };
        db::insert_run(&connection, &run)?;
        if plan.status == "awaiting_confirmation" {
            db::update_plan_status(&connection, &plan.id, "confirmed")?;
        }
        let cancelled = Arc::new(AtomicBool::new(false));
        state
            .cancellations
            .lock()
            .map_err(|_| AppError::retryable("WORKFLOW_BUSY", "任务状态暂时不可用"))?
            .insert(run.id.clone(), cancelled.clone());
        (plan, run, cancelled)
    };
    emit(
        &app,
        &plan,
        Some(&run.id),
        "workflow.started",
        json!({"status":"running"}),
    );
    let root = state.data_root.clone();
    let plan_for_task = plan.clone();
    let run_for_task = run.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        execute_workflow(&root, &plan_for_task, &run_for_task, cancelled)
    })
    .await
    .map_err(|error| AppError::retryable("WORKFLOW_TASK_FAILED", error.to_string()))?;
    let mut final_run = run;
    let connection = state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
    state
        .cancellations
        .lock()
        .ok()
        .and_then(|mut values| values.remove(&final_run.id));
    match result {
        Ok(artifacts) => {
            db::update_run(&connection, &final_run.id, "succeeded", None)?;
            final_run.status = "succeeded".into();
            final_run.finished_at = Some(db::now());
            emit(
                &app,
                &plan,
                Some(&final_run.id),
                "workflow.succeeded",
                json!({"artifactIds":artifacts.iter().map(|item| &item.id).collect::<Vec<_>>() }),
            );
            Ok(final_run)
        }
        Err(error) => {
            let status = if error.code == "WORKFLOW_CANCELLED" {
                "cancelled"
            } else {
                "failed"
            };
            db::update_run(&connection, &final_run.id, status, Some(&error))?;
            emit(
                &app,
                &plan,
                Some(&final_run.id),
                &format!("workflow.{status}"),
                json!({"errorCode":error.code,"message":error.message}),
            );
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn start_task_plan_run(
    plan_id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<WorkflowRun> {
    confirm_task_plan(plan_id, app, state).await
}

#[tauri::command]
pub fn cancel_workflow(run_id: String, state: State<'_, AppState>) -> AppResult<()> {
    let values = state
        .cancellations
        .lock()
        .map_err(|_| AppError::retryable("WORKFLOW_BUSY", "任务状态暂时不可用"))?;
    let flag = values
        .get(&run_id)
        .ok_or_else(|| AppError::new("WORKFLOW_NOT_RUNNING", "任务未运行或已经结束"))?;
    flag.store(true, Ordering::Relaxed);
    drop(values);
    let connection = state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
    connection
        .execute(
            "UPDATE executions SET runtime_json=json_set(runtime_json,'$.cancelRequestedAt',?1) WHERE task_plan_run_id=?2 AND status='running'",
            rusqlite::params![db::now(), run_id],
        )
        .map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok(())
}
