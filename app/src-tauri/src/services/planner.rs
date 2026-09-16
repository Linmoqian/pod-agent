/*
 * 受控 Agent 请求组装：把 SQLite 上下文与非敏感模型选择交给常驻 Node Agent。
 * Created on 2026-09-12
 * Updated on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::cell::RefCell;
use std::collections::HashSet;
use std::time::Duration;
use tauri::AppHandle;

use crate::domain::Dataset;
use crate::error::{AppError, AppResult};
use crate::services::{agent::AgentManager, credentials};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomProviderRequest {
    pub base_url: String,
}

/// 前端只能提交 Provider/Model 引用；完整 API Key 由 Rust 从 Keychain 注入 Agent stdin。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelRequest {
    pub provider_id: String,
    pub model_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_provider: Option<CustomProviderRequest>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProposal {
    pub title: String,
    pub trait_id: String,
    #[serde(default)]
    pub summary: String,
}

/// 讨论模式的历史消息（由 Rust 从 SQLite 截取后下发）。
pub struct DiscussTurn {
    pub role: String,
    pub content: String,
}

/// 讨论模式的真实模型输出。`reasoning` 仅在模型实际返回思考增量时存在。
pub struct DiscussReply {
    pub text: String,
    pub reasoning: Option<String>,
}

/// Agent 推送的真实增量；YOLO 事件的 JSON 负载仍只在 Rust 内部流转。
pub struct AgentProgress {
    pub kind: String,
    pub delta: String,
}

fn clean_json(text: &str) -> &str {
    let trimmed = text.trim();
    let without_prefix = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed)
        .trim();
    without_prefix
        .strip_suffix("```")
        .unwrap_or(without_prefix)
        .trim()
}

fn validate_request_id(request_id: &str) -> AppResult<()> {
    uuid::Uuid::parse_str(request_id)
        .map(|_| ())
        .map_err(|_| AppError::new("REQUEST_ID_INVALID", "Agent 请求 ID 必须是 UUID"))
}

fn validate_model_request(model: &AgentModelRequest) -> AppResult<()> {
    if model.provider_id.trim().is_empty() || model.model_id.trim().is_empty() {
        return Err(AppError::new("MODEL_REQUIRED", "请选择可用模型"));
    }
    if model.provider_id.len() > 128 || model.model_id.len() > 512 {
        return Err(AppError::new("MODEL_INVALID", "模型引用长度无效"));
    }
    if let Some(custom) = &model.custom_provider {
        if !model.provider_id.starts_with("custom-") {
            return Err(AppError::new(
                "MODEL_INVALID",
                "自定义 Provider ID 必须使用 custom- 前缀",
            ));
        }
        let valid_url = !custom.base_url.is_empty()
            && !custom.base_url.chars().any(char::is_whitespace)
            && custom.base_url.len() <= 2048
            && (custom.base_url.starts_with("http://") || custom.base_url.starts_with("https://"));
        if !valid_url {
            return Err(AppError::new(
                "PROVIDER_URL_INVALID",
                "自定义 Provider 地址无效",
            ));
        }
    }
    Ok(())
}

fn model_payload(model: Option<&AgentModelRequest>) -> AppResult<Value> {
    let Some(model) = model else {
        if cfg!(debug_assertions) {
            // 开发态允许 Node 从 agent/.env 取得默认模型；发行态由 UI 显式选择。
            return Ok(json!({}));
        }
        return Err(AppError::new("MODEL_REQUIRED", "发行版必须先选择模型"));
    };
    validate_model_request(model)?;
    let mut payload = serde_json::to_value(model)
        .map_err(|error| AppError::new("MODEL_INVALID", error.to_string()))?;
    if let Some(key) = credentials::read_provider_key(&model.provider_id)? {
        if let Some(object) = payload.as_object_mut() {
            // 该私有字段只存在于 Rust 到 Agent 的内存 JSONL；不会返回给 WebView、SQLite 或事件。
            object.insert("apiKey".into(), Value::String(key));
        }
    }
    Ok(payload)
}

fn check_agent_ok(response: &Value) -> AppResult<()> {
    if response["ok"].as_bool() == Some(true) {
        return Ok(());
    }
    let code = response["errorCode"].as_str().unwrap_or("AGENT_FAILED");
    let message = response["error"].as_str().unwrap_or("Agent 调用失败");
    let retryable = !matches!(
        code,
        "MODEL_REQUIRED" | "MODEL_INVALID" | "MODEL_NOT_FOUND" | "PROVIDER_URL_INVALID"
    );
    if retryable {
        Err(AppError::retryable(code, message))
    } else {
        Err(AppError::new(code, message))
    }
}

fn emit_progress(value: &Value, on_progress: &impl Fn(&AgentProgress)) {
    match value["eventType"].as_str() {
        Some("reply.delta") => {
            let kind = value["kind"].as_str().unwrap_or_default();
            let delta = value["delta"].as_str().unwrap_or_default();
            if matches!(kind, "thinking" | "text") && !delta.is_empty() {
                on_progress(&AgentProgress {
                    kind: kind.into(),
                    delta: delta.into(),
                });
            }
        }
        Some("yolo.task") => {
            if let Some(task) = value.get("task") {
                on_progress(&AgentProgress {
                    kind: "yolo.task".into(),
                    delta: task.to_string(),
                });
            }
        }
        _ => {}
    }
}

pub fn propose(
    app: &AppHandle,
    manager: &AgentManager,
    request_id: &str,
    conversation_id: &str,
    model: Option<&AgentModelRequest>,
    intent: &str,
    dataset: &Dataset,
) -> AppResult<(AgentProposal, String)> {
    validate_request_id(request_id)?;
    uuid::Uuid::parse_str(conversation_id)
        .map_err(|_| AppError::new("CONVERSATION_ID_INVALID", "会话 ID 无效"))?;
    let request = json!({
        "protocol": 2,
        "type": "prompt",
        "requestId": request_id,
        "conversationId": conversation_id,
        "mode": "plan",
        "model": model_payload(model)?,
        "history": [],
        "context": {},
        "message": serde_json::to_string(&json!({
            "intent": intent,
            "dataset": {
                "id": dataset.id,
                "name": dataset.name,
                "schema": dataset.schema,
                "qualityStatus": dataset.quality_status
            }
        }))
        .map_err(|error| AppError::new("AGENT_PROTOCOL_ERROR", error.to_string()))?
    });
    let response = manager.prompt(app, request, Duration::from_secs(45), |_| {})?;
    check_agent_ok(&response)?;
    let reply = response["reply"]
        .as_str()
        .ok_or_else(|| AppError::retryable("AGENT_OUTPUT_INVALID", "Agent 计划回复缺少文本"))?;
    let proposal = serde_json::from_str(clean_json(reply))
        .map_err(|error| AppError::retryable("AGENT_OUTPUT_INVALID", error.to_string()))?;
    let model_name = response["model"].as_str().unwrap_or("unknown").to_string();
    Ok((proposal, model_name))
}

/// 讨论模式：无真实数据也可回答，但上下文里明确声明当前拥有什么，禁止虚构。
pub fn discuss(
    app: &AppHandle,
    manager: &AgentManager,
    request_id: &str,
    conversation_id: &str,
    model: Option<&AgentModelRequest>,
    message: &str,
    history: &[DiscussTurn],
    context: &Value,
    on_progress: impl Fn(&AgentProgress),
) -> AppResult<DiscussReply> {
    validate_request_id(request_id)?;
    uuid::Uuid::parse_str(conversation_id)
        .map_err(|_| AppError::new("CONVERSATION_ID_INVALID", "会话 ID 无效"))?;
    let request = json!({
        "protocol": 2,
        "type": "prompt",
        "requestId": request_id,
        "conversationId": conversation_id,
        "mode": "discuss",
        "model": model_payload(model)?,
        "message": message,
        "history": history
            .iter()
            .map(|turn| json!({"role": turn.role, "content": turn.content}))
            .collect::<Vec<_>>(),
        "context": context
    });
    let active = RefCell::new(HashSet::<String>::new());
    let response = manager.prompt(app, request, Duration::from_secs(15 * 60), |event| {
        if event["eventType"] == "yolo.task" {
            if let Some(task_id) = event["task"]["id"].as_str() {
                if matches!(event["task"]["status"].as_str(), Some("queued" | "running")) {
                    active.borrow_mut().insert(task_id.into());
                } else {
                    active.borrow_mut().remove(task_id);
                }
            }
        }
        emit_progress(event, &on_progress);
    });
    for task_id in active.borrow().iter() {
        on_progress(&AgentProgress {
            kind: "yolo.task".into(),
            delta: json!({
                "id": task_id,
                "status": "error",
                "message": "Agent 进程已结束，未收到识别结果"
            })
            .to_string(),
        });
    }
    let response = response?;
    check_agent_ok(&response)?;
    let reasoning = response["reasoning"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let text = response["reply"]
        .as_str()
        .ok_or_else(|| AppError::retryable("AGENT_OUTPUT_INVALID", "Agent 讨论回复缺少文本"))?
        .trim()
        .to_string();
    Ok(DiscussReply { text, reasoning })
}
