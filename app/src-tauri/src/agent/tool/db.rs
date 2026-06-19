use rusqlite::{params, Connection};
use serde::Serialize;

/// 初始化 tool_call_log 表，在 init_db 中调用
///
/// 记录每一次工具调用（人类或 LLM），是"历史可回溯"原则的物理载体。
pub fn init_tool_call_log_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS tool_call_log (
            id TEXT PRIMARY KEY,
            caller TEXT NOT NULL,
            tool_name TEXT NOT NULL,
            args TEXT NOT NULL,
            result TEXT,
            status TEXT NOT NULL,
            error TEXT,
            session_id TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tcl_created ON tool_call_log(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_tcl_session ON tool_call_log(session_id);",
    )
    .map_err(|e| format!("创建 tool_call_log 表失败: {}", e))?;
    Ok(())
}

/// 工具调用开始：写一条 status=running 的记录，返回前占位，结束后由 finish_call 回填
pub fn start_call(
    id: &str,
    caller: &str,
    tool_name: &str,
    args: &str,
    session_id: Option<&str>,
    created_at: &str,
    conn: &Connection,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO tool_call_log (id, caller, tool_name, args, status, session_id, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, caller, tool_name, args, "running", session_id, created_at],
    )
    .map_err(|e| format!("写入工具调用日志失败: {}", e))?;
    Ok(())
}

/// 工具调用结束：回填 status / result / error
pub fn finish_call(
    id: &str,
    status: &str,
    result: Option<&str>,
    error: Option<&str>,
    conn: &Connection,
) -> Result<(), String> {
    conn.execute(
        "UPDATE tool_call_log SET status = ?1, result = ?2, error = ?3 WHERE id = ?4",
        params![status, result, error, id],
    )
    .map_err(|e| format!("更新工具调用日志失败: {}", e))?;
    Ok(())
}

/// 一条工具调用记录（前端历史面板用）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallLog {
    pub id: String,
    pub caller: String,
    pub tool_name: String,
    /// JSON 字符串，前端按需解析
    pub args: String,
    /// JSON 字符串，当时返回的真相（尊重真相：存全量，可回看）
    pub result: Option<String>,
    pub status: String,
    pub error: Option<String>,
    pub session_id: Option<String>,
    pub created_at: String,
}

/// 查询工具调用历史，支持按 caller / tool_name / session_id 过滤
pub fn list_calls(
    caller: Option<&str>,
    tool_name: Option<&str>,
    session_id: Option<&str>,
    limit: u32,
    conn: &Connection,
) -> Result<Vec<ToolCallLog>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, caller, tool_name, args, result, status, error, session_id, created_at \
             FROM tool_call_log \
             WHERE (?1 IS NULL OR caller = ?1) \
               AND (?2 IS NULL OR tool_name = ?2) \
               AND (?3 IS NULL OR session_id = ?3) \
             ORDER BY created_at DESC LIMIT ?4",
        )
        .map_err(|e| format!("准备查询失败: {}", e))?;

    let rows = stmt
        .query_map(params![caller, tool_name, session_id, limit], |row| {
            Ok(ToolCallLog {
                id: row.get(0)?,
                caller: row.get(1)?,
                tool_name: row.get(2)?,
                args: row.get(3)?,
                result: row.get(4)?,
                status: row.get(5)?,
                error: row.get(6)?,
                session_id: row.get(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(|e| format!("查询工具调用历史失败: {}", e))?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}
