/*
 * lian 对话上下文命令：会话永远存在，Project 是可选的科研容器。
 * 「lian 永远可聊，数据让它可做，项目让它可持续。」
 * Created on 2026-09-14
 * @author: https://github.com/Linmoqian
 */

use serde::Deserialize;
use serde_json::{json, Value};
use std::path::Path;
use tauri::{Emitter, State};

use crate::domain::{Conversation, ConversationContext, Project};
use crate::error::{AppError, AppResult};
use crate::services::{db, planner, research, storage};
use crate::state::AppState;

const TEMPORARY_TITLE: &str = "临时会话";
/// 讨论模式下随请求下发给 Agent 的最近历史条数。
const DISCUSS_HISTORY_LIMIT: usize = 12;

fn new_conversation(project_id: Option<&str>, title: &str) -> Conversation {
    let timestamp = db::now();
    Conversation {
        id: uuid::Uuid::new_v4().to_string(),
        project_id: project_id.map(str::to_string),
        title: title.into(),
        status: "active".into(),
        created_at: timestamp.clone(),
        updated_at: timestamp,
    }
}

fn cloned_conversation_title(
    connection: &rusqlite::Connection,
    source_title: &str,
) -> AppResult<String> {
    let title = source_title.trim();
    let title = if title.is_empty() {
        TEMPORARY_TITLE
    } else {
        title
    };
    let base = format!("{title}（副本）");
    if !db::conversation_title_exists(connection, &base)? {
        return Ok(base);
    }
    let mut number = 2_u64;
    loop {
        let candidate = format!("{title}（副本 {number}）");
        if !db::conversation_title_exists(connection, &candidate)? {
            return Ok(candidate);
        }
        number = number.saturating_add(1);
    }
}

fn cloned_project_title(
    connection: &rusqlite::Connection,
    source_title: &str,
) -> AppResult<String> {
    let title = source_title.trim();
    let title = if title.is_empty() { "未命名育种项目" } else { title };
    let base = format!("{title}（副本）");
    let exists = |name: &str| -> AppResult<bool> {
        connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM projects WHERE name=?1)",
                [name],
                |row| row.get(0),
            )
            .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))
    };
    if !exists(&base)? {
        return Ok(base);
    }
    let mut number = 2_u64;
    loop {
        let candidate = format!("{title}（副本 {number}）");
        if !exists(&candidate)? {
            return Ok(candidate);
        }
        number = number.saturating_add(1);
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneMessageInput {
    #[serde(default)]
    pub task_plan_id: Option<String>,
    pub role: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub reasoning: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
}

fn normalized_clone_messages(
    messages: Vec<CloneMessageInput>,
) -> AppResult<Vec<CloneMessageInput>> {
    let mut normalized = Vec::with_capacity(messages.len());
    for mut message in messages {
        if !matches!(message.role.as_str(), "user" | "assistant") {
            return Err(AppError::new("CLONE_MESSAGE_INVALID", "会话副本包含不支持的消息角色"));
        }
        if message.content.len() > 4 * 1024 * 1024 {
            return Err(AppError::new("CLONE_MESSAGE_TOO_LARGE", "会话消息超过允许大小"));
        }
        if message
            .reasoning
            .as_deref()
            .map(str::len)
            .unwrap_or_default()
            > 4 * 1024 * 1024
        {
            return Err(AppError::new("CLONE_MESSAGE_TOO_LARGE", "会话思考文本超过允许大小"));
        }
        if message.role == "assistant"
            && message.content.trim().is_empty()
            && message
                .reasoning
                .as_deref()
                .unwrap_or_default()
                .trim()
                .is_empty()
        {
            continue;
        }
        if message.created_at.as_deref().unwrap_or_default().is_empty() {
            message.created_at = Some(db::now());
        }
        normalized.push(message);
    }
    Ok(normalized)
}

fn cleanup_clone_directory(path: &Path, original: AppError) -> AppError {
    match std::fs::remove_dir_all(path) {
        Ok(()) => original,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => original,
        Err(error) => AppError::new(
            "CLONE_ROLLBACK_FAILED",
            format!(
                "会话副本已回滚，但清理项目目录失败：{}；原始错误：{}",
                error, original.message
            ),
        ),
    }
}

fn validate_shared_project_paths(
    connection: &rusqlite::Connection,
    root: &std::path::Path,
    project_id: &str,
) -> AppResult<()> {
    for (table, column) in [
        ("source_files", "managed_path"),
        ("datasets", "canonical_path"),
        ("dataset_versions", "canonical_path"),
        ("artifacts", "directory"),
    ] {
        let mut statement = connection
            .prepare(&format!("SELECT {column} FROM {table} WHERE project_id=?1"))
            .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
        let paths = statement
            .query_map([project_id], |row| row.get::<_, String>(0))
            .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
        for path in paths {
            let path = path
                .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
            storage::validate_managed_path(root, &path)?;
        }
    }
    Ok(())
}

/// 组装渐进式上下文：conversation 永远存在，project 为空时其余字段全部为空。
fn build_context(
    connection: &rusqlite::Connection,
    conversation: &Conversation,
) -> AppResult<ConversationContext> {
    let Some(project) = conversation.project_id.as_ref() else {
        return Ok(ConversationContext {
            conversation: conversation.clone(),
            project: None,
            overview: None,
            datasets: Vec::new(),
            schemas: Vec::new(),
            materials: Vec::new(),
            traits: Vec::new(),
            environments: Vec::new(),
            artifacts: Vec::new(),
            task_plans: Vec::new(),
            task_plan_runs: Vec::new(),
            executions: Vec::new(),
            workflow_runs: Vec::new(),
            messages: db::conversation_messages(connection, &conversation.id)?,
        });
    };
    Ok(ConversationContext {
        conversation: conversation.clone(),
        overview: Some(research::overview(connection, project)?),
        datasets: db::datasets(connection, project)?,
        schemas: research::schemas(connection, project)?,
        materials: research::materials(connection, project)?,
        traits: research::traits(connection, project)?,
        environments: research::environments(connection, project)?,
        artifacts: db::artifacts(connection, project)?,
        task_plans: db::plans(connection, project)?,
        task_plan_runs: research::task_plan_runs(connection, project)?,
        executions: research::executions(connection, project)?,
        workflow_runs: db::runs(connection, project)?,
        messages: db::conversation_messages(connection, &conversation.id)?,
        project: Some(db::project(connection, project)?),
    })
}

/// 启动入口：恢复最近活跃会话；首次使用时新建临时会话，不创建任何 Project。
#[tauri::command]
pub fn ensure_active_conversation(state: State<'_, AppState>) -> AppResult<ConversationContext> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
    let conversation = match db::latest_conversation(&connection)? {
        Some(conversation) => conversation,
        None => {
            let conversation = new_conversation(None, TEMPORARY_TITLE);
            db::insert_conversation(&connection, &conversation)?;
            conversation
        }
    };
    build_context(&connection, &conversation)
}

/// 会话维度的上下文读取（事件刷新用）。
#[tauri::command]
pub fn get_conversation_context(
    conversation_id: String,
    state: State<'_, AppState>,
) -> AppResult<ConversationContext> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
    let conversation = db::conversation(&connection, &conversation_id)?;
    build_context(&connection, &conversation)
}

/// 进入项目上下文：恢复该项目最近会话，没有则新开一个挂在项目下的会话。
#[tauri::command]
pub fn open_project_context(
    project_id: String,
    state: State<'_, AppState>,
) -> AppResult<ConversationContext> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
    let project = db::project(&connection, &project_id)?;
    let conversation = match db::latest_project_conversation(&connection, &project_id)? {
        Some(conversation) => conversation,
        None => {
            let conversation = new_conversation(Some(&project_id), &project.name);
            db::insert_conversation(&connection, &conversation)?;
            conversation
        }
    };
    build_context(&connection, &conversation)
}

/// 新开一个临时会话。
#[tauri::command]
pub fn new_temporary_conversation(state: State<'_, AppState>) -> AppResult<ConversationContext> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
    let conversation = new_conversation(None, TEMPORARY_TITLE);
    db::insert_conversation(&connection, &conversation)?;
    build_context(&connection, &conversation)
}

/// 以 git clone 语义复制会话；项目会话同时复制独立的项目上下文。
#[tauri::command]
pub fn clone_conversation(
    conversation_id: String,
    messages: Option<Vec<CloneMessageInput>>,
    state: State<'_, AppState>,
) -> AppResult<ConversationContext> {
    let mut connection = state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
    let source = db::conversation(&connection, &conversation_id)?;
    let source_project = source
        .project_id
        .as_ref()
        .map(|project_id| db::project(&connection, project_id))
        .transpose()?;
    let source_messages = match messages {
        Some(messages) => normalized_clone_messages(messages)?,
        None => normalized_clone_messages(
            db::conversation_messages(&connection, &source.id)?
                .into_iter()
                .map(|message| CloneMessageInput {
                    task_plan_id: message.task_plan_id,
                    role: message.role,
                    content: message.content,
                    reasoning: message.reasoning,
                    created_at: Some(message.created_at),
                })
                .collect(),
        )?,
    };
    let cloned_project = if let Some(project) = &source_project {
        Some(Project {
            id: uuid::Uuid::new_v4().to_string(),
            name: cloned_project_title(&connection, &project.name)?,
            status: "active".into(),
            created_at: db::now(),
            updated_at: db::now(),
        })
    } else {
        None
    };
    if let Some(project) = &source_project {
        validate_shared_project_paths(&connection, &state.data_root, &project.id)?;
    }
    let cloned_conversation = Conversation {
        id: uuid::Uuid::new_v4().to_string(),
        project_id: cloned_project.as_ref().map(|project| project.id.clone()),
        title: cloned_conversation_title(&connection, &source.title)?,
        status: "active".into(),
        created_at: db::now(),
        updated_at: db::now(),
    };
    let project_directory = if let Some(project) = &cloned_project {
        match storage::ensure_project_dirs(&state.data_root, &project.id) {
            Ok(directory) => Some(directory),
            Err(error) => {
                let partial_directory = state.data_root.join("projects").join(&project.id);
                return Err(cleanup_clone_directory(&partial_directory, error));
            }
        }
    } else {
        None
    };
    let clone_result = (|| {
        let transaction = connection
            .transaction()
            .map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
        if let Some(project) = &cloned_project {
            transaction
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
        }
        let mappings = if let (Some(source_project), Some(target_project)) =
            (&source_project, &cloned_project)
        {
            db::clone_project_context(&transaction, &source_project.id, &target_project.id)?
        } else {
            db::ProjectCloneMappings::default()
        };
        db::insert_conversation(&transaction, &cloned_conversation)?;
        for message in source_messages {
            let task_plan_id = if cloned_project.is_some() {
                message
                    .task_plan_id
                    .as_ref()
                    .and_then(|id| mappings.task_plans.get(id))
            } else {
                None
            };
            transaction
                .execute(
                    "INSERT INTO messages(id,conversation_id,task_plan_id,role,content,reasoning,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7)",
                    rusqlite::params![
                        uuid::Uuid::new_v4().to_string(),
                        cloned_conversation.id,
                        task_plan_id,
                        message.role,
                        message.content,
                        message.reasoning,
                        message.created_at.unwrap_or_else(db::now)
                    ],
                )
                .map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
        }
        transaction
            .commit()
            .map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
        Ok::<(), AppError>(())
    })();
    if let Err(error) = clone_result {
        if let Some(directory) = project_directory {
            return Err(cleanup_clone_directory(&directory, error));
        }
        return Err(error);
    }
    build_context(&connection, &cloned_conversation)
}

/// 讨论模式的上下文摘要：明确告知 Agent 当前拥有什么、没有什么。
fn agent_context_summary(context: &ConversationContext) -> Value {
    let project = context.project.as_ref().map(|project| {
        json!({
            "name": project.name,
            "datasetCount": context.datasets.len(),
            "artifactCount": context.artifacts.len(),
            "materialCount": context.materials.len(),
        })
    });
    json!({
        "project": project,
        "datasets": context.datasets.iter().map(|dataset| json!({
            "id": dataset.id,
            "name": dataset.name,
            "type": dataset.dataset_type,
            "traits": dataset.schema["traits"],
        })).collect::<Vec<_>>(),
        "artifacts": context.artifacts.iter().map(|artifact| artifact.name.clone()).collect::<Vec<_>>(),
    })
}

/// 自由对话：无数据也允许提问；Agent 只能讨论与规划，不能虚构真实数据。
#[tauri::command]
pub async fn send_message(
    conversation_id: String,
    content: String,
    request_id: String,
    model: Option<planner::AgentModelRequest>,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<ConversationContext> {
    let content = content.trim().to_string();
    if content.is_empty() {
        return Err(AppError::new("MESSAGE_REQUIRED", "消息内容不能为空"));
    }
    uuid::Uuid::parse_str(&request_id)
        .map_err(|_| AppError::new("REQUEST_ID_INVALID", "Agent 请求 ID 必须是 UUID"))?;
    let (conversation, history, context_summary) = {
        let connection = state
            .connection
            .lock()
            .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
        let conversation = db::conversation(&connection, &conversation_id)?;
        let context = build_context(&connection, &conversation)?;
        let history = context
            .messages
            .iter()
            .rev()
            .take(DISCUSS_HISTORY_LIMIT)
            .rev()
            .map(|message| planner::DiscussTurn {
                role: message.role.clone(),
                content: message.content.clone(),
            })
            .collect::<Vec<_>>();
        (conversation, history, agent_context_summary(&context))
    };
    {
        // 先落用户消息再调 Agent：即使进程中断，提问也不丢。
        let connection = state
            .connection
            .lock()
            .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
        db::insert_message(&connection, &conversation.id, None, "user", &content, None)?;
    }
    let stream_app = app.clone();
    let stream_conversation_id = conversation.id.clone();
    let stream_request_id = request_id.clone();
    let manager = state.agent.clone();
    let event_app = stream_app.clone();
    let event_conversation_id = stream_conversation_id.clone();
    let event_request_id = stream_request_id.clone();
    let reply = tauri::async_runtime::spawn_blocking(move || {
        planner::discuss(
            &stream_app,
            &manager,
            planner::DiscussRequest {
                request_id: &stream_request_id,
                conversation_id: &stream_conversation_id,
                model: model.as_ref(),
                message: &content,
                history: &history,
                context: &context_summary,
            },
            move |progress| {
                if progress.kind == "yolo.task" {
                    if let Ok(mut payload) =
                        serde_json::from_str::<serde_json::Value>(&progress.delta)
                    {
                        payload["requestId"] = json!(event_request_id);
                        payload["conversationId"] = json!(event_conversation_id);
                        let _ = event_app.emit("lian-yolo-event", payload);
                    }
                    return;
                }
                let _ = event_app.emit(
                    "lian-agent-event",
                    json!({
                        "eventType": "agent.reply.delta",
                        "requestId": event_request_id,
                        "conversationId": event_conversation_id,
                        "kind": progress.kind,
                        "delta": progress.delta,
                    }),
                );
            },
        )
    })
    .await
    .map_err(|error| AppError::retryable("AGENT_FAILED", error.to_string()))??;
    let connection = state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
    db::insert_message(
        &connection,
        &conversation.id,
        None,
        "assistant",
        &reply.text,
        reply.reasoning.as_deref(),
    )?;
    build_context(&connection, &conversation)
}

/// 取消指定的讨论或计划请求；实际 abort 由常驻 Node Agent 继续传播到 Pi 与工具。
#[tauri::command]
pub fn cancel_agent(request_id: String, state: State<'_, AppState>) -> AppResult<()> {
    uuid::Uuid::parse_str(&request_id)
        .map_err(|_| AppError::new("REQUEST_ID_INVALID", "Agent 请求 ID 必须是 UUID"))?;
    state.agent.abort(&request_id)
}

/// 把当前会话提升为项目：对话保留，归属转移，后续数据可落地。
#[tauri::command]
pub fn promote_conversation(
    conversation_id: String,
    name: String,
    state: State<'_, AppState>,
) -> AppResult<ConversationContext> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::new("PROJECT_NAME_REQUIRED", "项目名称不能为空"));
    }
    let connection = state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
    let conversation = db::conversation(&connection, &conversation_id)?;
    if conversation.project_id.is_some() {
        return Err(AppError::new(
            "CONVERSATION_ALREADY_IN_PROJECT",
            "当前会话已归属项目",
        ));
    }
    let project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.into(),
        status: "active".into(),
        created_at: db::now(),
        updated_at: db::now(),
    };
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
    db::attach_conversation_to_project(&connection, &conversation_id, &project.id)?;
    let project_id = project.id.clone();
    let conversation = Conversation {
        project_id: Some(project.id),
        ..conversation
    };
    drop(connection);
    storage::ensure_project_dirs(&state.data_root, &project_id)?;
    let connection = state
        .connection
        .lock()
        .map_err(|_| AppError::retryable("DB_BUSY", "数据库暂时不可用"))?;
    build_context(&connection, &conversation)
}
