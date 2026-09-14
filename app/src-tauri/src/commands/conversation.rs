/*
 * lian 对话上下文命令：会话永远存在，Project 是可选的科研容器。
 * 「lian 永远可聊，数据让它可做，项目让它可持续。」
 * Created on 2026-09-14
 * @author: https://github.com/Linmoqian
 */

use serde_json::{json, Value};
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
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> AppResult<ConversationContext> {
    let content = content.trim().to_string();
    if content.is_empty() {
        return Err(AppError::new("MESSAGE_REQUIRED", "消息内容不能为空"));
    }
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
    let app_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let stream_app = app.clone();
    let stream_conversation_id = conversation.id.clone();
    let reply = tauri::async_runtime::spawn_blocking(move || {
        planner::discuss(
            &app_dir,
            &content,
            &history,
            &context_summary,
            move |progress| {
                let _ = stream_app.emit(
                    "lian-agent-event",
                    json!({
                        "eventType": "agent.reply.delta",
                        "conversationId": stream_conversation_id,
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
