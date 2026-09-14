/*
 * lian 受控 Agent 进程通信：plan（结构化计划）与 discuss（自由讨论）两种请求。
 * Created on 2026-09-12
 * Updated on 2026-09-14
 * @author: https://github.com/Linmoqian
 */

use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use crate::domain::Dataset;
use crate::error::{AppError, AppResult};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProposal {
    pub title: String,
    pub trait_id: String,
    #[serde(default)]
    pub summary: String,
}

/// 讨论模式的历史消息（由 Rust 折叠后下发，Agent 进程不自行拉取）。
pub struct DiscussTurn {
    pub role: String,
    pub content: String,
}

/// 讨论模式的真实模型输出。`reasoning` 仅在当前模型实际返回思考增量时存在。
pub struct DiscussReply {
    pub text: String,
    pub reasoning: Option<String>,
}

/// Agent 推送的真实增量；只接受 Pi 产生的 thinking/text 片段。
pub struct AgentProgress {
    pub kind: String,
    pub delta: String,
}

fn clean_json(text: &str) -> &str {
    text.trim()
        .strip_prefix("```json")
        .or_else(|| text.trim().strip_prefix("```"))
        .unwrap_or(text.trim())
        .trim()
        .strip_suffix("```")
        .unwrap_or(text.trim())
        .trim()
}

/// 与受控 Agent 进程完成一次 JSONL 请求/响应，超时即终止进程。
fn agent_request(
    app_dir: &Path,
    request: Value,
    response_type: &str,
    timeout: Duration,
    on_progress: Option<&dyn Fn(&AgentProgress)>,
) -> AppResult<Value> {
    let script = app_dir.join("agent").join("agent.ts");
    let (yolo_url, yolo_token) = super::yolo::endpoint(app_dir.parent().unwrap_or(app_dir))
        .map_err(|error| AppError::new("YOLO_UNAVAILABLE", error))?;
    let mut child = Command::new("node")
        .env("YOLO_ONNX_URL", yolo_url)
        .env("YOLO_ONNX_TOKEN", yolo_token)
        .arg("--env-file-if-exists=agent/.env")
        .arg(script)
        .current_dir(app_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| AppError::retryable("AGENT_UNAVAILABLE", error.to_string()))?;
    let request_id = request["requestId"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| AppError::new("AGENT_PROTOCOL_ERROR", "无法写入 Agent 进程"))?;
    stdin
        .write_all(format!("{request}\n").as_bytes())
        .map_err(|error| AppError::new("AGENT_PROTOCOL_ERROR", error.to_string()))?;
    drop(stdin);
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::new("AGENT_PROTOCOL_ERROR", "无法读取 Agent 输出"))?;
    let (line_sender, line_receiver) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            if line_sender.send(line).is_err() {
                break;
            }
        }
    });
    let started = Instant::now();
    let mut result = None;
    while result.is_none() {
        let elapsed = started.elapsed();
        if elapsed > timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err(AppError::retryable(
                "AGENT_TIMEOUT",
                format!("Agent 响应超过 {} 秒", timeout.as_secs()),
            ));
        }
        let remaining = timeout.saturating_sub(elapsed);
        match line_receiver.recv_timeout(remaining.min(Duration::from_millis(100))) {
            Ok(Ok(line)) => {
                let Ok(value) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                if value["requestId"].as_str() != Some(&request_id) {
                    continue;
                }
                if value["type"] == "discuss.delta" {
                    let kind = value["kind"].as_str().unwrap_or_default();
                    let delta = value["delta"].as_str().unwrap_or_default();
                    if matches!(kind, "thinking" | "text") && !delta.is_empty() {
                        if let Some(callback) = on_progress {
                            callback(&AgentProgress {
                                kind: kind.into(),
                                delta: delta.into(),
                            });
                        }
                    }
                } else if value["type"] == response_type {
                    result = Some(value);
                }
            }
            Ok(Err(error)) => {
                return Err(AppError::retryable(
                    "AGENT_PROTOCOL_ERROR",
                    error.to_string(),
                ));
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if child
                    .try_wait()
                    .map_err(|error| AppError::retryable("AGENT_FAILED", error.to_string()))?
                    .is_some()
                {
                    break;
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    child
        .wait()
        .map_err(|error| AppError::retryable("AGENT_FAILED", error.to_string()))?;
    result.ok_or_else(|| AppError::new("AGENT_PROTOCOL_ERROR", "Agent 进程未返回结果"))
}

fn check_agent_ok(response: &Value) -> AppResult<()> {
    if response["ok"] != Value::Bool(true) {
        return Err(AppError::retryable(
            "AGENT_FAILED",
            response["error"].as_str().unwrap_or("Agent 调用失败"),
        ));
    }
    Ok(())
}

pub fn propose(
    app_dir: &Path,
    intent: &str,
    dataset: &Dataset,
) -> AppResult<(AgentProposal, String)> {
    let request = json!({
        "requestId": uuid::Uuid::new_v4().to_string(),
        "type": "plan",
        "intent": intent,
        "dataset": {
            "id": dataset.id,
            "name": dataset.name,
            "schema": dataset.schema,
            "qualityStatus": dataset.quality_status
        }
    });
    let response = agent_request(
        app_dir,
        request,
        "plan.result",
        Duration::from_secs(45),
        None,
    )?;
    check_agent_ok(&response)?;
    let proposal = serde_json::from_str(clean_json(
        response["proposal"].as_str().unwrap_or_default(),
    ))
    .map_err(|error| AppError::retryable("AGENT_OUTPUT_INVALID", error.to_string()))?;
    Ok((
        proposal,
        response["model"].as_str().unwrap_or("unknown").to_string(),
    ))
}

/// 讨论模式：无真实数据也可回答，但上下文里明确声明当前拥有什么，禁止虚构。
pub fn discuss(
    app_dir: &Path,
    message: &str,
    history: &[DiscussTurn],
    context: &Value,
    on_progress: impl Fn(&AgentProgress),
) -> AppResult<DiscussReply> {
    let request = json!({
        "requestId": uuid::Uuid::new_v4().to_string(),
        "type": "discuss",
        "message": message,
        "history": history
            .iter()
            .map(|turn| json!({"role": turn.role, "content": turn.content}))
            .collect::<Vec<_>>(),
        "context": context
    });
    let response = agent_request(
        app_dir,
        request,
        "discuss.result",
        Duration::from_secs(120),
        Some(&on_progress),
    )?;
    check_agent_ok(&response)?;
    let reasoning = response["reasoning"]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    Ok(DiscussReply {
        text: response["reply"]
            .as_str()
            .unwrap_or_default()
            .trim()
            .to_string(),
        reasoning,
    })
}
