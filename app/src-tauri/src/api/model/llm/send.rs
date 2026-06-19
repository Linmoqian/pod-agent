use crate::agent::session::{Message, db::DbState};
use crate::agent::tool::{self, Caller};
use crate::api::model::llm::llm_provider;
use crate::api::model::llm::receive::{ParsedToolCall, ToolCallAccum};

use chrono::Local;
use rusqlite::{params, Connection};
use tauri::{Emitter, State};
use uuid::Uuid;

const SYSTEM_PROMPT: &str = "你是 Pod Agent 育种助手。可调用 query_phenotypes 查询已拍照片的表型统计。\n返回字段含义：count=检测数、avg_confidence=平均置信度、reviewed=人工复核数、n_low=低置信检测数、n_high=高置信检测数。\n规则：当 reviewed 为 0 或样本量很少时，必须在回答中明确\"数据未经人工复核，结论仅供参考\"。不臆测没有的数据。";

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

#[derive(Clone, serde::Serialize)]
struct LlmToolCallEvent {
    session_id: String,
    tool_call_id: String,
    name: String,
    args: serde_json::Value,
}

#[derive(Clone, serde::Serialize)]
struct LlmToolResultEvent {
    session_id: String,
    tool_call_id: String,
    success: bool,
    result: serde_json::Value,
}

/// 内部：从数据库读取会话历史消息（含 tool_calls / tool_call_id）
fn load_history_messages(conn: &Connection, session_id: &str) -> Result<Vec<Message>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, role, content, thinking, tool_calls, tool_call_id, created_at \
             FROM messages WHERE session_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| format!("准备查询失败: {}", e))?;
    let rows = stmt
        .query_map([session_id], |row| {
            Ok(Message {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                thinking: row.get(4)?,
                tool_calls: row.get(5)?,
                tool_call_id: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| format!("查询历史失败: {}", e))?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

/// 内部：插入一条消息（含 tool_calls / tool_call_id）
fn insert_message(
    conn: &Connection,
    session_id: &str,
    role: &str,
    content: &str,
    thinking: &str,
    tool_calls: &str,
    tool_call_id: &str,
) -> Result<Message, String> {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let msg = Message {
        id: Uuid::new_v4().to_string(),
        session_id: session_id.to_string(),
        role: role.to_string(),
        content: content.to_string(),
        thinking: thinking.to_string(),
        tool_calls: tool_calls.to_string(),
        tool_call_id: tool_call_id.to_string(),
        created_at: now,
    };
    conn.execute(
        "INSERT INTO messages (id, session_id, role, content, thinking, tool_calls, tool_call_id, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            &msg.id,
            &msg.session_id,
            &msg.role,
            &msg.content,
            &msg.thinking,
            &msg.tool_calls,
            &msg.tool_call_id,
            &msg.created_at
        ],
    )
    .map_err(|e| format!("插入消息失败: {}", e))?;
    Ok(msg)
}

/// 内部：更新会话时间戳
fn touch_session(conn: &Connection, session_id: &str) -> Result<(), String> {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
        params![&now, session_id],
    )
    .map_err(|e| format!("更新会话时间戳失败: {}", e))?;
    Ok(())
}

/// 内部：把 ParsedToolCall 序列化为持久化用的 tool_calls JSON 数组字符串
fn serialize_tool_calls(tool_calls: &[ParsedToolCall]) -> String {
    let arr: Vec<serde_json::Value> = tool_calls
        .iter()
        .map(|tc| {
            serde_json::json!({
                "id": tc.id,
                "type": "function",
                "function": {
                    "name": tc.name,
                    "arguments": serde_json::to_string(&tc.arguments).unwrap_or_default()
                }
            })
        })
        .collect();
    serde_json::to_string(&arr).unwrap_or_default()
}

/// 内部：发起一次流式请求，累积 content / thinking / tool_calls 并 emit 增量。
async fn stream_request(
    app: &tauri::AppHandle,
    session_id: &str,
    config: &llm_provider::LLMConfig,
    messages: &[serde_json::Value],
    tools: Option<&[serde_json::Value]>,
) -> Result<(String, String, Vec<ParsedToolCall>), String> {
    let url = format!("{}/chat/completions", config.endpoint.trim_end_matches('/'));
    let mut body = serde_json::json!({
        "model": config.model,
        "messages": messages,
        "stream": true,
    });
    if let Some(t) = tools {
        if !t.is_empty() {
            body["tools"] = serde_json::Value::Array(t.to_vec());
            body["tool_choice"] = serde_json::json!("auto");
        }
    }

    let client = reqwest::Client::new();
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

    let mut full_content = String::new();
    let mut full_thinking = String::new();
    let mut accum = ToolCallAccum::new();
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
            let delta = json
                .get("choices")
                .and_then(|c| c.get(0))
                .and_then(|c| c.get("delta"));

            if let Some(t) = delta
                .and_then(|d| d.get("reasoning_content"))
                .and_then(|c| c.as_str())
            {
                if !t.is_empty() {
                    full_thinking.push_str(t);
                    let _ = app.emit(
                        "llm-thinking",
                        LlmThinkingEvent {
                            session_id: session_id.into(),
                            delta: t.into(),
                        },
                    );
                }
            }

            if let Some(c) = delta.and_then(|d| d.get("content")).and_then(|c| c.as_str()) {
                if !c.is_empty() {
                    full_content.push_str(c);
                    let _ = app.emit(
                        "llm-chunk",
                        LlmChunkEvent {
                            session_id: session_id.into(),
                            delta: c.into(),
                        },
                    );
                }
            }

            if let Some(tc) = delta.and_then(|d| d.get("tool_calls")) {
                accum.feed(tc);
            }
        }
    }

    Ok((full_content, full_thinking, accum.finish()))
}

#[tauri::command]
pub async fn send_llm_message(
    session_id: String,
    content: String,
    app: tauri::AppHandle,
    db: State<'_, DbState>,
) -> Result<Message, String> {
    let config = llm_provider::load_llm_config()?;

    // 1. 持久化用户消息 + 加载历史
    let (user_msg, history) = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| format!("数据库锁获取失败: {}", e))?;
        let user_msg = insert_message(&conn, &session_id, "user", &content, "", "", "")?;
        let history = load_history_messages(&conn, &session_id)?;
        (user_msg, history)
    };

    // 2. 组装首轮 messages（prepend system）
    let mut first_msgs: Vec<serde_json::Value> =
        vec![serde_json::json!({ "role": "system", "content": SYSTEM_PROMPT })];
    first_msgs.extend(build_openai_messages(&history));

    let schemas = tool::tool_schemas();

    // 3. 第一轮：带 tools
    let (content1, thinking1, tool_calls) =
        stream_request(&app, &session_id, &config, &first_msgs, Some(schemas.as_slice())).await?;

    // 3a. 无工具调用 → 直接回答
    if tool_calls.is_empty() {
        let assistant_msg = {
            let conn = db
                .conn
                .lock()
                .map_err(|e| format!("数据库锁获取失败: {}", e))?;
            let msg = insert_message(&conn, &session_id, "assistant", &content1, &thinking1, "", "")?;
            touch_session(&conn, &session_id)?;
            msg
        };
        let _ = app.emit(
            "llm-done",
            LlmDoneEvent {
                session_id: session_id.clone(),
                message: assistant_msg,
            },
        );
        return Ok(user_msg);
    }

    // 4. 有工具调用：持久化 assistant(tool_calls)
    let tool_calls_json = serialize_tool_calls(&tool_calls);
    {
        let conn = db
            .conn
            .lock()
            .map_err(|e| format!("数据库锁获取失败: {}", e))?;
        insert_message(&conn, &session_id, "assistant", &content1, &thinking1, &tool_calls_json, "")?;
    }

    // 5. 逐个执行工具 + emit + 持久化 role=tool
    let mut tool_results: Vec<serde_json::Value> = Vec::new();
    for tc in &tool_calls {
        let _ = app.emit(
            "llm-tool-call",
            LlmToolCallEvent {
                session_id: session_id.clone(),
                tool_call_id: tc.id.clone(),
                name: tc.name.clone(),
                args: tc.arguments.clone(),
            },
        );

        let result = {
            let conn = db
                .conn
                .lock()
                .map_err(|e| format!("数据库锁获取失败: {}", e))?;
            tool::execute_tool(Caller::Llm, &tc.name, &tc.arguments, Some(&session_id), &conn)
        };

        let (success, result_val) = match result {
            Ok(v) => (true, v),
            Err(e) => (false, serde_json::json!({ "error": e })),
        };
        let _ = app.emit(
            "llm-tool-result",
            LlmToolResultEvent {
                session_id: session_id.clone(),
                tool_call_id: tc.id.clone(),
                success,
                result: result_val.clone(),
            },
        );

        let result_str = serde_json::to_string(&result_val).unwrap_or_default();
        {
            let conn = db
                .conn
                .lock()
                .map_err(|e| format!("数据库锁获取失败: {}", e))?;
            // tool 消息的 tool_calls 字段冗余存调用信息，供前端工具气泡直接读取（不参与 LLM 协议）
            insert_message(&conn, &session_id, "tool", &result_str, "", &tool_calls_json, &tc.id)?;
        }
        tool_results.push(serde_json::json!({
            "role": "tool",
            "tool_call_id": tc.id,
            "content": result_str,
        }));
    }

    // 6. 第二轮：不带 tools，强制文字总结
    let mut second_msgs = first_msgs.clone();
    second_msgs.push(serde_json::json!({
        "role": "assistant",
        "content": if content1.is_empty() {
            serde_json::Value::Null
        } else {
            serde_json::Value::String(content1.clone())
        },
        "tool_calls": serde_json::from_str::<serde_json::Value>(&tool_calls_json)
            .unwrap_or(serde_json::Value::Null),
    }));
    second_msgs.extend(tool_results);

    let (content2, thinking2, _) =
        stream_request(&app, &session_id, &config, &second_msgs, None).await?;

    // 7. 持久化最终 assistant 回复
    let assistant_msg = {
        let conn = db
            .conn
            .lock()
            .map_err(|e| format!("数据库锁获取失败: {}", e))?;
        let thinking_final = format!("{}{}", thinking1, thinking2);
        let msg = insert_message(&conn, &session_id, "assistant", &content2, &thinking_final, "", "")?;
        touch_session(&conn, &session_id)?;
        msg
    };

    let _ = app.emit(
        "llm-done",
        LlmDoneEvent {
            session_id: session_id.clone(),
            message: assistant_msg,
        },
    );

    Ok(user_msg)
}

/// 将持久化 Message 列表组装成 OpenAI chat messages（含 tool_calls / tool 结果）。
fn build_openai_messages(msgs: &[Message]) -> Vec<serde_json::Value> {
    msgs.iter()
        .filter_map(|m| match m.role.as_str() {
            "assistant" if !m.tool_calls.is_empty() => {
                let tool_calls: serde_json::Value =
                    serde_json::from_str(&m.tool_calls).unwrap_or(serde_json::Value::Null);
                Some(serde_json::json!({
                    "role": "assistant",
                    "content": if m.content.is_empty() {
                        serde_json::Value::Null
                    } else {
                        serde_json::Value::String(m.content.clone())
                    },
                    "tool_calls": tool_calls,
                }))
            }
            "tool" => Some(serde_json::json!({
                "role": "tool",
                "tool_call_id": m.tool_call_id,
                "content": m.content,
            })),
            _ => Some(serde_json::json!({ "role": m.role, "content": m.content })),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::session::Message;

    fn msg(role: &str, content: &str, tool_calls: &str, tool_call_id: &str) -> Message {
        Message {
            id: "x".into(),
            session_id: "s".into(),
            role: role.into(),
            content: content.into(),
            thinking: "".into(),
            tool_calls: tool_calls.into(),
            tool_call_id: tool_call_id.into(),
            created_at: "".into(),
        }
    }

    #[test]
    fn builds_assistant_with_tool_calls() {
        let tc = r#"[{"id":"c1","type":"function","function":{"name":"query_phenotypes","arguments":"{}"}}]"#;
        let v = build_openai_messages(&[msg("assistant", "", tc, "")]);
        assert_eq!(v[0]["role"], "assistant");
        assert_eq!(v[0]["tool_calls"][0]["id"], "c1");
        assert!(v[0]["content"].is_null());
    }

    #[test]
    fn builds_tool_result_message() {
        let v = build_openai_messages(&[msg("tool", "{\"count\":5}", "", "c1")]);
        assert_eq!(v[0]["role"], "tool");
        assert_eq!(v[0]["tool_call_id"], "c1");
        assert_eq!(v[0]["content"], "{\"count\":5}");
    }

    #[test]
    fn builds_plain_messages() {
        let v = build_openai_messages(&[msg("user", "hi", "", "")]);
        assert_eq!(v[0]["role"], "user");
        assert_eq!(v[0]["content"], "hi");
    }
}
