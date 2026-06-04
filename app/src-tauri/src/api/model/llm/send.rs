use crate::agent::session::{Message, db::DbState};
use crate::api::model::llm::llm_provider::LLMConfig;

use chrono::Local;
use rusqlite::params;
use tauri::{Emitter, State};
use uuid::Uuid;

/// SSE 流事件 payload
#[derive(Clone, serde::Serialize)]
struct LlmChunkEvent {
    session_id: String,
    delta: String,
}

#[derive(Clone, serde::Serialize)]
struct LlmThinkingEvent {
    session_id: String,
    delta: String,
}

#[derive(Clone, serde::Serialize)]
struct LlmDoneEvent {
    session_id: String,
    message: Message,
}

/// 内部：读取 LLM 配置文件
fn load_config() -> Result<LLMConfig, String> {
    let path = crate::paths::get_config_path();
    if !path.exists() {
        return Ok(LLMConfig::default());
    }
    let json = std::fs::read_to_string(&path).map_err(|e| format!("读取配置失败: {}", e))?;
    let config: LLMConfig = serde_json::from_str(&json).map_err(|e| format!("解析配置失败: {}", e))?;
    Ok(config)
}

/// 内部：从数据库读取会话历史消息
fn load_history(conn: &rusqlite::Connection, session_id: &str) -> Result<Vec<serde_json::Value>, String> {
    let mut stmt = conn
        .prepare("SELECT role, content FROM messages WHERE session_id = ?1 ORDER BY created_at ASC")
        .map_err(|e| format!("准备查询失败: {}", e))?;
    let rows = stmt
        .query_map([session_id], |row| {
            Ok(serde_json::json!({
                "role": row.get::<_, String>(0)?,
                "content": row.get::<_, String>(1)?,
            }))
        })
        .map_err(|e| format!("查询历史失败: {}", e))?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

/// 内部：插入一条消息到数据库（含 thinking）
fn insert_message(conn: &rusqlite::Connection, session_id: &str, role: &str, content: &str, thinking: &str) -> Result<Message, String> {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let msg = Message {
        id: Uuid::new_v4().to_string(),
        session_id: session_id.to_string(),
        role: role.to_string(),
        content: content.to_string(),
        thinking: thinking.to_string(),
        created_at: now,
    };
    conn.execute(
        "INSERT INTO messages (id, session_id, role, content, thinking, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![&msg.id, &msg.session_id, &msg.role, &msg.content, &msg.thinking, &msg.created_at],
    )
    .map_err(|e| format!("插入消息失败: {}", e))?;
    Ok(msg)
}

/// 内部：更新会话时间戳
fn touch_session(conn: &rusqlite::Connection, session_id: &str) -> Result<(), String> {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
        params![&now, session_id],
    )
    .map_err(|e| format!("更新会话时间戳失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn send_llm_message(
    session_id: String,
    content: String,
    app: tauri::AppHandle,
    db: State<'_, DbState>,
) -> Result<Message, String> {
    let config = load_config()?;

    // 1. 持久化用户消息 + 加载历史
    let (user_msg, messages) = {
        let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
        let user_msg = insert_message(&conn, &session_id, "user", &content, "")?;
        let messages = load_history(&conn, &session_id)?;
        (user_msg, messages)
    };

    // 2. 流式请求 LLM
    let url = format!("{}/chat/completions", config.endpoint.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": config.model,
        "messages": messages,
        "stream": true,
    });

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("LLM 请求失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("LLM 请求失败 (HTTP {}): {}", status, text));
    }

    // 3. 逐块读取 SSE 流
    let mut full_content = String::new();
    let mut full_thinking = String::new();
    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("读取流失败: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);
        for line in text.lines() {
            let line = line.trim();
            if !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            if data == "[DONE]" {
                continue;
            }
            let json: serde_json::Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => continue,
            };

            // 提取思考内容
            if let Some(thinking_delta) = json
                .get("choices").and_then(|c| c.get(0))
                .and_then(|c| c.get("delta"))
                .and_then(|d| d.get("reasoning_content"))
                .and_then(|c| c.as_str())
            {
                if !thinking_delta.is_empty() {
                    full_thinking.push_str(thinking_delta);
                    let _ = app.emit("llm-thinking", LlmThinkingEvent {
                        session_id: session_id.clone(),
                        delta: thinking_delta.to_string(),
                    });
                }
            }

            // 提取回复内容
            if let Some(content_delta) = json
                .get("choices").and_then(|c| c.get(0))
                .and_then(|c| c.get("delta"))
                .and_then(|d| d.get("content"))
                .and_then(|c| c.as_str())
            {
                if !content_delta.is_empty() {
                    full_content.push_str(content_delta);
                    let _ = app.emit("llm-chunk", LlmChunkEvent {
                        session_id: session_id.clone(),
                        delta: content_delta.to_string(),
                    });
                }
            }
        }
    }

    // 4. 持久化完整的 assistant 回复（含思考过程）
    let assistant_msg = {
        let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
        let msg = insert_message(&conn, &session_id, "assistant", &full_content, &full_thinking)?;
        touch_session(&conn, &session_id)?;
        msg
    };

    let _ = app.emit("llm-done", LlmDoneEvent {
        session_id: session_id.clone(),
        message: assistant_msg.clone(),
    });

    Ok(user_msg)
}
