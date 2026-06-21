pub mod db;
pub mod query_phenotypes;
pub mod search_photos;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::agent::session::db::DbState;

/// 工具调用方：人类与 LLM 共用同一套工具，仅此字段区分（历史可回溯的核心维度）
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Caller {
    Human,
    Llm,
}

impl Caller {
    pub fn as_str(self) -> &'static str {
        match self {
            Caller::Human => "human",
            Caller::Llm => "llm",
        }
    }
}

/// 聚合所有可被 LLM 调用的工具 schema。新增工具时在此注册。
pub fn tool_schemas() -> Vec<serde_json::Value> {
    vec![query_phenotypes::schema(), search_photos::schema()]
}

/// 统一工具执行入口：人与 LLM 共用。
///
/// 职责：
/// 1. 留痕——每次调用写 tool_call_log（caller 区分人/LLM，可回溯）
/// 2. 分发——按 tool_name 路由到具体工具实现（工具少时用 match，YAGNI 不上 trait 注册表）
/// 3. 返回原始真相——不粉饰，工具返回什么就给调用方什么
pub fn execute_tool(
    caller: Caller,
    tool_name: &str,
    args: &serde_json::Value,
    session_id: Option<&str>,
    conn: &Connection,
) -> Result<serde_json::Value, String> {
    let log_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let args_str = serde_json::to_string(args).unwrap_or_default();

    db::start_call(
        &log_id,
        caller.as_str(),
        tool_name,
        &args_str,
        session_id,
        &now,
        conn,
    )?;

    let result = match tool_name {
        "query_phenotypes" => query_phenotypes::run(args, conn),
        "search_photos" => search_photos::run(args, conn),
        _ => Err(format!("未知工具: {}", tool_name)),
    };

    match &result {
        Ok(v) => {
            let res_str = serde_json::to_string(v).unwrap_or_default();
            db::finish_call(&log_id, "success", Some(&res_str), None, conn)?;
        }
        Err(e) => {
            db::finish_call(&log_id, "error", None, Some(e), conn)?;
        }
    }
    result
}

/// 人类调用工具的通用入口（caller 恒为 Human）。
/// 前端：invoke("invoke_tool", { toolName, args, sessionId? })
#[tauri::command]
pub fn invoke_tool(
    tool_name: String,
    args: serde_json::Value,
    session_id: Option<String>,
    db: State<'_, DbState>,
) -> Result<serde_json::Value, String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
    execute_tool(Caller::Human, &tool_name, &args, session_id.as_deref(), &conn)
}

/// 查询工具调用历史（按 caller / tool_name / session_id 过滤）。
/// 前端：invoke("list_tool_calls", { caller?, toolName?, sessionId?, limit? })
#[tauri::command]
pub fn list_tool_calls(
    caller: Option<String>,
    tool_name: Option<String>,
    session_id: Option<String>,
    limit: Option<u32>,
    db: State<'_, DbState>,
) -> Result<Vec<db::ToolCallLog>, String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
    db::list_calls(
        caller.as_deref(),
        tool_name.as_deref(),
        session_id.as_deref(),
        limit.unwrap_or(100),
        &conn,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schemas_include_query_phenotypes() {
        let s = tool_schemas();
        assert!(!s.is_empty());
        let name = s[0]
            .get("function")
            .unwrap()
            .get("name")
            .unwrap()
            .as_str()
            .unwrap();
        assert_eq!(name, "query_phenotypes");
    }

    #[test]
    fn schemas_include_search_photos() {
        let s = tool_schemas();
        let names: Vec<&str> = s
            .iter()
            .filter_map(|v| v.get("function")?.get("name")?.as_str())
            .collect();
        assert!(names.contains(&"search_photos"));
    }

    #[test]
    fn execute_tool_dispatches_search_photos() {
        use crate::agent::session::db::init_db;
        let state = init_db(":memory:").expect("init_db 失败");
        let conn = state.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO photos (id, file_path, thumbnail_path, captured_at, width, height, mode, batch_label) \
             VALUES ('p1','/p.jpg','/t.jpg','2026-06-01 09:00:00',1,1,'photo','')", []).unwrap();
        conn.execute(
            "INSERT INTO phenotypes (id, photo_id, class_name, count, avg_confidence, min_confidence, max_confidence, items, created_at) \
             VALUES ('ph1','p1','豆荚',1,0.9,0.9,0.9,'[]','2026-06-01 09:00:00')", []).unwrap();
        let v = execute_tool(Caller::Llm, "search_photos", &serde_json::json!({}), None, &conn).unwrap();
        assert_eq!(v["photos"].as_array().unwrap().len(), 1);
    }
}
