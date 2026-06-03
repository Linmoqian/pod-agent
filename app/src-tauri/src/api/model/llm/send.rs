use crate::agent::session::{Message, db::DbState};
use crate::api::model::llm::llm_provider::LLMConfig;
use crate::api::model::llm::receive::parse_llm_response;
use chrono::Local;
use rusqlite::params;
use tauri::State;
use uuid::Uuid;

/// 内部：读取 LLM 配置文件（不走 Tauri command）
fn load_config() -> Result<LLMConfig, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let path = std::path::PathBuf::from(home).join(".pod-agent").join("config.json");
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

/// 内部：插入一条消息到数据库
fn insert_message(conn: &rusqlite::Connection, session_id: &str, role: &str, content: &str) -> Result<Message, String> {
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let msg = Message {
        id: Uuid::new_v4().to_string(),
        session_id: session_id.to_string(),
        role: role.to_string(),
        content: content.to_string(),
        created_at: now,
    };
    conn.execute(
        "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![&msg.id, &msg.session_id, &msg.role, &msg.content, &msg.created_at],
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
    db: State<'_, DbState>,
) -> Result<Vec<Message>, String> {
    let config = load_config()?;

    // 1. 持久化用户消息 + 加载历史（在一个锁块内完成）
    let (user_msg, messages) = {
        let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
        let user_msg = insert_message(&conn, &session_id, "user", &content)?;
        let messages = load_history(&conn, &session_id)?;
        (user_msg, messages)
    }; // 锁在此释放

    // 2. 发送 HTTP 请求到 LLM
    let url = format!("{}/chat/completions", config.endpoint.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": config.model,
        "messages": messages,
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

    let resp_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析 LLM 响应失败: {}", e))?;

    let assistant_content = parse_llm_response(&resp_json)?;

    // 3. 持久化 assistant 回复（新的锁块）
    let assistant_msg = {
        let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
        let msg = insert_message(&conn, &session_id, "assistant", &assistant_content)?;
        touch_session(&conn, &session_id)?;
        msg
    }; // 锁在此释放

    Ok(vec![user_msg, assistant_msg])
}
