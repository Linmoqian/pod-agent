use serde::Deserialize;
use serde_json::{json, Value};
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
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

pub fn propose(
    app_dir: &Path,
    intent: &str,
    dataset: &Dataset,
) -> AppResult<(AgentProposal, String)> {
    let script = app_dir.join("agent").join("agent.ts");
    let mut child = Command::new("node")
        .arg("--env-file-if-exists=agent/.env")
        .arg(script)
        .current_dir(app_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| AppError::retryable("AGENT_UNAVAILABLE", error.to_string()))?;
    let request_id = uuid::Uuid::new_v4().to_string();
    let request = json!({
        "requestId": request_id,
        "type": "plan",
        "intent": intent,
        "dataset": {
            "id": dataset.id,
            "name": dataset.name,
            "schema": dataset.schema,
            "qualityStatus": dataset.quality_status
        }
    });
    child
        .stdin
        .take()
        .ok_or_else(|| AppError::new("AGENT_PROTOCOL_ERROR", "无法写入计划进程"))?
        .write_all(format!("{request}\n").as_bytes())
        .map_err(|error| AppError::retryable("AGENT_PROTOCOL_ERROR", error.to_string()))?;
    let started = Instant::now();
    loop {
        if child
            .try_wait()
            .map_err(|error| AppError::retryable("AGENT_FAILED", error.to_string()))?
            .is_some()
        {
            break;
        }
        if started.elapsed() > Duration::from_secs(45) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(AppError::retryable("AGENT_TIMEOUT", "计划生成超过 45 秒"));
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let output = child
        .wait_with_output()
        .map_err(|error| AppError::retryable("AGENT_FAILED", error.to_string()))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let response: Value = stdout
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .find(|value| value["type"] == "plan.result" && value["requestId"] == request_id)
        .ok_or_else(|| AppError::retryable("AGENT_PROTOCOL_ERROR", "计划进程未返回结果"))?;
    if response["ok"] != Value::Bool(true) {
        return Err(AppError::retryable(
            "AGENT_FAILED",
            response["error"].as_str().unwrap_or("计划生成失败"),
        ));
    }
    let proposal = serde_json::from_str(clean_json(
        response["proposal"].as_str().unwrap_or_default(),
    ))
    .map_err(|error| AppError::retryable("AGENT_OUTPUT_INVALID", error.to_string()))?;
    Ok((
        proposal,
        response["model"].as_str().unwrap_or("unknown").to_string(),
    ))
}
