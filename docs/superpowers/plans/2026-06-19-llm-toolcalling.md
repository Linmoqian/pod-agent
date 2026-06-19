# LLM Tool Calling 接通 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 chat 对话中的 LLM（DeepSeek-V3）能自主调用 `query_phenotypes` 工具，结果回填后用自然语言作答，形成单轮闭环；前端以独立工具气泡呈现调用过程。

**Architecture:** `send.rs` 内联单轮闭环（第一轮带 `tools` → 执行 `execute_tool(Caller::Llm)` → 第二轮不带 `tools` 强制文字总结）；`tool_calls` 分片解析下沉 `receive.rs`（不动原 reasoning 流）；`messages` 表加 `tool_calls`/`tool_call_id` 两列扛单轮；不新增命令、不新增表、`agent.rs` 保持空。

**Tech Stack:** Rust（rusqlite / reqwest / futures-util / serde_json）、Tauri 2 事件系统、React 19 + TypeScript + Zustand。

## Global Constraints

- 所有 Rust 命令在 `app/src-tauri/` 下执行：`cargo test`、`cargo build`、`cargo clippy`。
- 前端命令在 `app/` 下执行：`npx tsc --noEmit`。
- 错误类型沿用项目现有 `String`（不引入 `error.rs` enum，YAGNI）。
- 参数命名 camelCase（与 `QueryArgs` 的 `#[serde(rename_all="camelCase")]` 一致）。
- 提交信息 Conventional Commits + 中文，禁止任何 AI 生成字样。
- 中途不 build，全部代码写完后再 `cargo build`（CLAUDE.md）。
- 仅本地提交，不推送远程。
- DeepSeek-V3 (`deepseek-chat`) 为目标模型；只保证 OpenAI/DeepSeek 兼容协议，不做 Anthropic。

## File Structure

| 文件 | 职责 | 改动类型 |
|---|---|---|
| `agent/session/db.rs` | `messages` 表加 `tool_calls`/`tool_call_id` 列 | Modify |
| `agent/session/mod.rs` | `Message` 结构 + `message_from_row` | Modify |
| `agent/session/read.rs` | `get_messages` SELECT 扩展 | Modify |
| `agent/session/create.rs` | `create_message` 补新字段 | Modify |
| `api/model/llm/receive.rs` | `ToolCallAccum` / `ParsedToolCall`（分片解析） | Add |
| `agent/tool/query_phenotypes.rs` | `schema()` | Add |
| `agent/tool/mod.rs` | `tool_schemas()` | Add |
| `api/model/llm/send.rs` | `build_openai_messages` / `load_history_messages` / `stream_request` / 单轮闭环 / 新事件 | Modify |
| `store/chatStore.ts` | `ChatMessage` 加字段 + 工具事件监听 | Modify |
| `pages/chat/ToolCallBubble.tsx` | 工具气泡组件 | Create |
| `pages/chat/ChatMessageList.tsx` | tool 气泡渲染 + 载体消息过滤 | Modify |

---

## Task 1: messages 表加 tool_calls / tool_call_id 列 + Message 结构 + 读写适配

**Files:**
- Modify: `app/src-tauri/src/agent/session/db.rs`
- Modify: `app/src-tauri/src/agent/session/mod.rs:18-46`
- Modify: `app/src-tauri/src/agent/session/read.rs:38-52`
- Modify: `app/src-tauri/src/agent/session/create.rs:25-56`
- Test: `app/src-tauri/src/agent/session/db.rs`（内联 `#[cfg(test)]`）

**Interfaces:**
- Produces: `Message { id, session_id, role, content, thinking, tool_calls: String, tool_call_id: String, created_at }`；`message_from_row` 列顺序 = `id, session_id, role, content, thinking, tool_calls, tool_call_id, created_at`（索引 0-7）。

- [ ] **Step 1: 写失败测试（db.rs 末尾追加）**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn messages_table_has_tool_columns() {
        let state = init_db(":memory:").expect("init_db 失败");
        let conn = state.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO messages (id, session_id, role, content, thinking, tool_calls, tool_call_id, created_at) \
             VALUES ('m1','s1','assistant','c','','[{\"id\":\"x\"}]','','2026-01-01 00:00:00')",
            [],
        )
        .expect("插入失败");
        let row: (String, String) = conn
            .query_row(
                "SELECT tool_calls, tool_call_id FROM messages WHERE id='m1'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .expect("查询失败");
        assert_eq!(row.0, "[{\"id\":\"x\"}]");
        assert_eq!(row.1, "");
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd app/src-tauri && cargo test --lib session::db::tests`
Expected: 编译失败（`Message` 缺字段 / 列不存在）或运行时 `no such column: tool_calls`。

- [ ] **Step 3: db.rs 加列（在 `init_db` 的 thinking ALTER 之后、`init_photos_table` 之前插入）**

```rust
    // 兼容旧数据库：tool_calls / tool_call_id 列（承载 OpenAI function calling 协议）
    let has_tool_calls: bool = conn
        .prepare("SELECT tool_calls FROM messages LIMIT 0")
        .is_ok();
    if !has_tool_calls {
        conn.execute_batch("ALTER TABLE messages ADD COLUMN tool_calls TEXT NOT NULL DEFAULT '';")
            .map_err(|e| format!("添加 tool_calls 列失败: {}", e))?;
    }
    let has_tool_call_id: bool = conn
        .prepare("SELECT tool_call_id FROM messages LIMIT 0")
        .is_ok();
    if !has_tool_call_id {
        conn.execute_batch("ALTER TABLE messages ADD COLUMN tool_call_id TEXT NOT NULL DEFAULT '';")
            .map_err(|e| format!("添加 tool_call_id 列失败: {}", e))?;
    }
```

- [ ] **Step 4: mod.rs 扩展 Message 结构与 message_from_row**

替换 `mod.rs:18-46`：

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub thinking: String,
    pub tool_calls: String,
    pub tool_call_id: String,
    pub created_at: String,
}

pub fn session_from_row(row: &Row) -> Result<Session, rusqlite::Error> {
    Ok(Session {
        id: row.get(0)?,
        title: row.get(1)?,
        created_at: row.get(2)?,
        updated_at: row.get(3)?,
    })
}

pub fn message_from_row(row: &Row) -> Result<Message, rusqlite::Error> {
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
}
```

- [ ] **Step 5: read.rs 的 get_messages SELECT 扩展（read.rs:42）**

```rust
        .prepare("SELECT id, session_id, role, content, thinking, tool_calls, tool_call_id, created_at FROM messages WHERE session_id = ?1 ORDER BY created_at ASC")
```

- [ ] **Step 6: create.rs 的 create_message 补字段（create.rs:32-47）**

```rust
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let message = Message {
        id: Uuid::new_v4().to_string(),
        session_id,
        role,
        content,
        thinking: String::new(),
        tool_calls: String::new(),
        tool_call_id: String::new(),
        created_at: now.clone(),
    };

    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
    conn.execute(
        "INSERT INTO messages (id, session_id, role, content, thinking, tool_calls, tool_call_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![&message.id, &message.session_id, &message.role, &message.content, &message.thinking, &message.tool_calls, &message.tool_call_id, &message.created_at],
    )
    .map_err(|e| format!("插入消息失败: {}", e))?;
```

- [ ] **Step 7: 运行测试确认通过**

Run: `cd app/src-tauri && cargo test --lib session::db::tests`
Expected: PASS（1 个测试）。

- [ ] **Step 8: 编译确认无破坏**

Run: `cd app/src-tauri && cargo build`
Expected: 编译通过（其他构造 `Message` 的地方会在后续 Task 修复，本 Task 范围内 `create_message` 已补）。

- [ ] **Step 9: 提交**

```bash
git add app/src-tauri/src/agent/session/db.rs app/src-tauri/src/agent/session/mod.rs app/src-tauri/src/agent/session/read.rs app/src-tauri/src/agent/session/create.rs
git commit -m "feat(agent): messages 表扩展 tool_calls/tool_call_id 字段"
```

---

## Task 2: receive.rs 的 ToolCallAccum（tool_calls 分片解析）

**Files:**
- Modify: `app/src-tauri/src/api/model/llm/receive.rs`（在现有函数后追加，不动原 `parse_*`）
- Test: `app/src-tauri/src/api/model/llm/receive.rs`（内联 `#[cfg(test)]`）

**Interfaces:**
- Produces: `ToolCallAccum::new() -> ToolCallAccum`；`ToolCallAccum::feed(&mut self, delta_tool_calls: &Value)`（入参为 `choices[0].delta.tool_calls` 数组）；`ToolCallAccum::finish(self) -> Vec<ParsedToolCall>`；`ParsedToolCall { id: String, name: String, arguments: Value }`。

- [ ] **Step 1: 写失败测试（receive.rs 末尾追加）**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn single_call_across_chunks() {
        let mut a = ToolCallAccum::new();
        a.feed(&json!([{"index":0,"id":"call_1","type":"function","function":{"name":"query_phenotypes","arguments":"{\"class"}}]));
        a.feed(&json!([{"index":0,"function":{"arguments":"Name\":\"豆荚\"}"}}]));
        let v = a.finish();
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].id, "call_1");
        assert_eq!(v[0].name, "query_phenotypes");
        assert_eq!(v[0].arguments, json!({"className": "豆荚"}));
    }

    #[test]
    fn multiple_calls_by_index() {
        let mut a = ToolCallAccum::new();
        a.feed(&json!([
            {"index":0,"id":"c0","function":{"name":"query_phenotypes","arguments":"{}"}},
            {"index":1,"id":"c1","function":{"name":"query_phenotypes","arguments":"{\"className\":\"叶\"}"}}
        ]));
        let v = a.finish();
        assert_eq!(v.len(), 2);
        assert_eq!(v[0].id, "c0");
        assert_eq!(v[1].arguments, json!({"className":"叶"}));
    }

    #[test]
    fn empty_arguments_become_empty_object() {
        let mut a = ToolCallAccum::new();
        a.feed(&json!([{"index":0,"id":"c0","function":{"name":"q","arguments":""}}]));
        let v = a.finish();
        assert_eq!(v[0].arguments, json!({}));
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd app/src-tauri && cargo test --lib api::model::llm::receive::tests`
Expected: 编译失败（`ToolCallAccum` 未定义）。

- [ ] **Step 3: 实现（receive.rs 顶部 use 之后追加）**

```rust
use std::collections::BTreeMap;

/// 流式 tool_call 解析后的完整结构。
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

/// 累积 OpenAI / DeepSeek-V3 兼容的流式 tool_calls 分片。
/// 按 `index` 聚合 id / name / arguments 字符串，流结束后整体解析。
#[derive(Default)]
pub struct ToolCallAccum {
    inner: BTreeMap<usize, PartialToolCall>,
}

#[derive(Default)]
struct PartialToolCall {
    id: String,
    name: String,
    args_buf: String,
}

impl ToolCallAccum {
    pub fn new() -> Self {
        Self::default()
    }

    /// 喂入一个 `choices[0].delta.tool_calls` 片段（数组）。
    pub fn feed(&mut self, delta_tool_calls: &serde_json::Value) {
        let Some(arr) = delta_tool_calls.as_array() else {
            return;
        };
        for item in arr {
            let index = item
                .get("index")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as usize;
            let part = self.inner.entry(index).or_default();
            if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                if !id.is_empty() {
                    part.id = id.to_string();
                }
            }
            if let Some(f) = item.get("function").and_then(|v| v.as_object()) {
                if let Some(name) = f.get("name").and_then(|v| v.as_str()) {
                    if !name.is_empty() {
                        part.name = name.to_string();
                    }
                }
                if let Some(args) = f.get("arguments").and_then(|v| v.as_str()) {
                    part.args_buf.push_str(args);
                }
            }
        }
    }

    /// 流结束，按 index 升序组装完整 tool_calls。
    pub fn finish(self) -> Vec<ParsedToolCall> {
        self.inner
            .into_values()
            .map(|p| {
                let arguments = if p.args_buf.is_empty() {
                    serde_json::Value::Object(serde_json::Map::new())
                } else {
                    serde_json::from_str(&p.args_buf).unwrap_or(serde_json::Value::Null)
                };
                ParsedToolCall {
                    id: p.id,
                    name: p.name,
                    arguments,
                }
            })
            .collect()
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd app/src-tauri && cargo test --lib api::model::llm::receive::tests`
Expected: PASS（3 个测试）。

- [ ] **Step 5: 提交**

```bash
git add app/src-tauri/src/api/model/llm/receive.rs
git commit -m "feat(llm): 新增流式 tool_calls 分片累积解析 ToolCallAccum"
```

---

## Task 3: 工具 schema（query_phenotypes::schema + tool::tool_schemas）

**Files:**
- Modify: `app/src-tauri/src/agent/tool/query_phenotypes.rs`（追加 `schema()`）
- Modify: `app/src-tauri/src/agent/tool/mod.rs`（追加 `tool_schemas()` + 内联测试）

**Interfaces:**
- Produces: `query_phenotypes::schema() -> serde_json::Value`（OpenAI function 格式）；`tool::tool_schemas() -> Vec<serde_json::Value>`（聚合所有工具 schema）。

- [ ] **Step 1: 写失败测试（mod.rs 末尾追加）**

```rust
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
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd app/src-tauri && cargo test --lib agent::tool::tests`
Expected: 编译失败（`tool_schemas` 未定义）。

- [ ] **Step 3: query_phenotypes.rs 追加 schema()（文件末尾）**

```rust
/// OpenAI function calling 工具 schema（与 QueryArgs camelCase 一致）。
pub fn schema() -> serde_json::Value {
    serde_json::json!({
        "type": "function",
        "function": {
            "name": "query_phenotypes",
            "description": "查询已拍摄照片的表型统计聚合（数量、置信度、人工复核情况）。用户问某类别数量/置信度/可信度时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "className": {"type": "string", "description": "表型类别，如'豆荚'。留空返回全部类别。"},
                    "photoId": {"type": "string", "description": "限定某张照片。通常留空。"},
                    "limit": {"type": "integer", "description": "返回行数上限，默认 50。"}
                }
            }
        }
    })
}
```

- [ ] **Step 4: mod.rs 追加 tool_schemas()（在 `execute_tool` 之前插入）**

```rust
/// 聚合所有可被 LLM 调用的工具 schema。新增工具时在此注册。
pub fn tool_schemas() -> Vec<serde_json::Value> {
    vec![query_phenotypes::schema()]
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd app/src-tauri && cargo test --lib agent::tool::tests`
Expected: PASS（1 个测试）。

- [ ] **Step 6: 提交**

```bash
git add app/src-tauri/src/agent/tool/query_phenotypes.rs app/src-tauri/src/agent/tool/mod.rs
git commit -m "feat(agent): 暴露 query_phenotypes 工具 schema 供 LLM 调用"
```

---

## Task 4: send.rs 的 build_openai_messages（消息组装纯函数）

**Files:**
- Modify: `app/src-tauri/src/api/model/llm/send.rs`（追加纯函数 + 内联测试）

**Interfaces:**
- Consumes: `Message`（Task 1 产出）。
- Produces: `build_openai_messages(msgs: &[Message]) -> Vec<serde_json::Value>`——把持久化消息组装成 OpenAI chat messages：assistant 带 tool_calls 时输出 `{role, content:Null, tool_calls}`；role='tool' 时输出 `{role:"tool", tool_call_id, content}`；其余 `{role, content}`。

- [ ] **Step 1: 写失败测试（send.rs 末尾追加）**

```rust
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd app/src-tauri && cargo test --lib api::model::llm::send::tests`
Expected: 编译失败（`build_openai_messages` 未定义）。

- [ ] **Step 3: 实现 build_openai_messages（send.rs，建议放在 `load_history` 同区域）**

```rust
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd app/src-tauri && cargo test --lib api::model::llm::send::tests`
Expected: PASS（3 个测试）。

- [ ] **Step 5: 提交**

```bash
git add app/src-tauri/src/api/model/llm/send.rs
git commit -m "feat(llm): 新增 build_openai_messages 组装含 tool_calls 的请求体"
```

---

## Task 5: send.rs 单轮闭环编排（核心重写）

**Files:**
- Modify: `app/src-tauri/src/api/model/llm/send.rs`（整体重写编排逻辑）

**Interfaces:**
- Consumes: `Message`（Task 1）、`ToolCallAccum`/`ParsedToolCall`（Task 2）、`tool::tool_schemas`（Task 3）、`build_openai_messages`（Task 4）、`tool::execute_tool` + `tool::Caller::Llm`（已有）。
- Produces: 重写后的 `send_llm_message`（签名不变），新事件 `llm-tool-call` / `llm-tool-result`。

- [ ] **Step 1: 替换 send.rs 的 use 区与事件结构（send.rs:1-26）**

```rust
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
```

- [ ] **Step 2: 替换内部辅助函数（load_history_messages / insert_message / touch_session）**

替换 send.rs 原 `load_history` / `insert_message` / `touch_session`：

```rust
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
```

- [ ] **Step 3: 新增 stream_request（单次流式请求原语）**

```rust
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
```

- [ ] **Step 4: 重写 send_llm_message（单轮闭环编排）**

替换原 `send_llm_message`：

```rust
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
```

- [ ] **Step 5: 删除旧 parse_stream_chunk 引用残留（如有未使用 warning）**

检查 send.rs 不再引用旧 `load_history`（已重命名为 `load_history_messages`）。`receive.rs` 的 `parse_llm_response` / `parse_stream_chunk` 保持 `#[allow(dead_code)]` 不动。

- [ ] **Step 6: 编译 + 测试 + lint**

Run: `cd app/src-tauri && cargo test --lib api::model::llm::send::tests`
Expected: Task 4 的 3 个测试仍 PASS（build_openai_messages 未变）。

Run: `cd app/src-tauri && cargo build`
Expected: 编译通过。

Run: `cd app/src-tauri && cargo clippy`
Expected: 无 error（warning 视情况，不阻塞）。

- [ ] **Step 7: 提交**

```bash
git add app/src-tauri/src/api/model/llm/send.rs
git commit -m "feat(agent): send_llm_message 实现单轮 tool calling 闭环"
```

---

## Task 6: 前端工具气泡（chatStore + ToolCallBubble + ChatMessageList）

**Files:**
- Modify: `app/src/store/chatStore.ts`
- Create: `app/src/pages/chat/ToolCallBubble.tsx`
- Modify: `app/src/pages/chat/ChatMessageList.tsx`

**Interfaces:**
- Consumes: 后端事件 `llm-tool-call { session_id, tool_call_id, name, args }`、`llm-tool-result { session_id, tool_call_id, success, result }`；`ChatMessage` 增 `tool_calls?`、`tool_call_id?`。
- 渲染约定：`role==='tool'` 消息 → `ToolCallBubble`（name/args 读 `msg.tool_calls`，结果读 `msg.content`，空=运行中）；`role==='assistant' && !content && tool_calls` → 跳过（工具调用载体）。

- [ ] **Step 1: chatStore.ts 扩展 ChatMessage 类型（chatStore.ts:13-20）**

```typescript
export interface ChatMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  thinking: string;
  tool_calls?: string;
  tool_call_id?: string;
  created_at: string;
}
```

- [ ] **Step 2: chatStore.ts 的 sendMessage 加工具事件监听（chatStore.ts:179-184 区域）**

在现有 `unlistenChunk` / `unlistenThinking` 监听之后、`await invoke("send_llm_message", ...)` 之前，插入工具气泡监听：

```typescript
      const unlistenToolCall = await listen<{
        session_id: string;
        tool_call_id: string;
        name: string;
        args: unknown;
      }>("llm-tool-call", (e) => {
        if (e.payload.session_id !== sessionId) return;
        const toolMsg: ChatMessage = {
          id: `temp-tool-${e.payload.tool_call_id}`,
          session_id: sessionId,
          role: "tool",
          content: "",
          thinking: "",
          tool_calls: JSON.stringify([
            { function: { name: e.payload.name, arguments: e.payload.args } },
          ]),
          tool_call_id: e.payload.tool_call_id,
          created_at: new Date().toISOString(),
        };
        set((state) => {
          const msgs = [...state.messages];
          const idx = msgs.findIndex((m) => m.id === tempAssistantId);
          msgs.splice(idx === -1 ? msgs.length : idx, 0, toolMsg);
          return { messages: msgs };
        });
      });

      const unlistenToolResult = await listen<{
        session_id: string;
        tool_call_id: string;
        success: boolean;
        result: unknown;
      }>("llm-tool-result", (e) => {
        if (e.payload.session_id !== sessionId) return;
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === `temp-tool-${e.payload.tool_call_id}`
              ? { ...m, content: JSON.stringify(e.payload.result) }
              : m
          ),
        }));
      });

      await invoke("send_llm_message", { sessionId, content });
      unlistenChunk();
      unlistenThinking();
      unlistenToolCall();
      unlistenToolResult();
```

- [ ] **Step 3: 创建 ToolCallBubble.tsx**

```tsx
import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench } from "lucide-react";
import type { ChatMessage } from "../../store";

interface ToolCallInfo {
  function?: { name?: string; arguments?: unknown };
}

export default function ToolCallBubble({ msg }: { msg: ChatMessage }) {
  const [expanded, setExpanded] = useState(false);

  let info: ToolCallInfo = {};
  try {
    const parsed = JSON.parse(msg.tool_calls || "[]");
    info = Array.isArray(parsed) ? parsed[0] ?? {} : {};
  } catch {
    /* 保持空 */
  }
  const name = info.function?.name ?? "工具";
  const args = info.function?.arguments;
  const running = !msg.content;
  let resultParsed: unknown = null;
  try {
    resultParsed = msg.content ? JSON.parse(msg.content) : null;
  } catch {
    resultParsed = msg.content;
  }

  return (
    <div className="mb-4 flex gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#10B981] text-white">
        <Wrench size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="rounded-lg border border-[#E5E7EB] bg-[#F0FDF4]">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-[#374151] hover:text-[#111827]"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="font-mono">{name}</span>
            <span className="text-[#6B7280]">
              {running ? "调用中…" : "✓ 完成"}
            </span>
          </button>
          {expanded && (
            <div className="space-y-2 border-t border-[#E5E7EB] px-3 py-2 text-[12px]">
              <div>
                <div className="mb-0.5 text-[#9CA3AF]">参数</div>
                <pre className="overflow-auto whitespace-pre-wrap break-all font-mono text-[#374151]">
                  {JSON.stringify(args, null, 2)}
                </pre>
              </div>
              {!running && (
                <div>
                  <div className="mb-0.5 text-[#9CA3AF]">结果</div>
                  <pre className="overflow-auto whitespace-pre-wrap break-all font-mono text-[#374151]">
                    {JSON.stringify(resultParsed, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: ChatMessageList.tsx 适配渲染（ChatMessageList.tsx:1-4, 28-30）**

import 区加：
```tsx
import ToolCallBubble from "./ToolCallBubble";
```

渲染区替换：
```tsx
      {messages.map((msg) => {
        // 工具调用载体消息（assistant 且无 content）不单独渲染
        if (msg.role === "assistant" && !msg.content && msg.tool_calls) {
          return null;
        }
        if (msg.role === "tool") {
          return <ToolCallBubble key={msg.id} msg={msg} />;
        }
        return <MessageBubble key={msg.id} msg={msg} />;
      })}
```

- [ ] **Step 5: 类型检查**

Run: `cd app && npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 6: 提交**

```bash
git add app/src/store/chatStore.ts app/src/pages/chat/ToolCallBubble.tsx app/src/pages/chat/ChatMessageList.tsx
git commit -m "feat(chat): 新增工具调用气泡，展示 LLM 自主调用过程"
```

---

## Task 7: 端到端验收

**Files:** 无代码改动。

**前提：** `data/config.json` 已配置 DeepSeek-V3（provider=deepseek, model=deepseek-chat, 有效 api_key）；`data/sessions.db` 中已有照片与表型数据（可用相机功能拍摄几张或用既有数据）。

- [ ] **Step 1: 启动应用**

Run: `cd app && npm run tauri dev`
Expected: 应用正常启动，进入 chat 页面。

- [ ] **Step 2: 触发判据——LLM 自主调用工具**

在 chat 输入："今年豆荚拍了多少？"
Expected：
- 出现绿色工具气泡 `query_phenotypes`（调用中→✓完成）。
- 其后 assistant 用自然语言回答数量。
- 回答中若 reviewed 为 0，应含"数据未经人工复核"提示。

- [ ] **Step 3: 拒绝判据——空结果不编造**

在 chat 输入："拍到的'外星人'有多少？"（无此类别）
Expected：LLM 回复"没找到符合条件的记录"类，不编造数字。

- [ ] **Step 4: 工具调用留痕**

进入"工具调用"页面，筛选 caller=llm。
Expected：可见刚才的 `query_phenotypes` 调用记录（status=success，含 args/result）。

- [ ] **Step 5: 持久化渲染**

切换到其他会话再切回（或重启应用重开该会话）。
Expected：历史中的工具气泡正确渲染（name/参数/结果齐全）。

- [ ] **Step 6: 回归——纯文本对话不受影响**

进行一次无需工具的普通问答（如"你好"）。
Expected：正常流式回复，无工具气泡，行为与改造前一致。

- [ ] **Step 7: 全量测试回归**

Run: `cd app/src-tauri && cargo test`
Expected: 所有测试 PASS（Task 1-4 新增 + 既有）。

- [ ] **Step 8: 收尾提交（如有验收中发现的修复）**

若验收中发现 bug 并修复，按语义提交；无修复则跳过。

---

## Spec Coverage

| 设计文档章节 | 覆盖任务 |
|---|---|
| §3 单轮闭环数据流 | Task 5（stream_request ×2 + 第二轮不带 tools） |
| §4 schema 扩展（tool_calls/tool_call_id） | Task 1 |
| §5.1 receive.rs 分片解析 | Task 2 |
| §5.2 工具 schema 聚合 | Task 3 |
| §5.3 send.rs 编排 | Task 5 |
| §5.4 系统提示词 | Task 5（SYSTEM_PROMPT const） |
| §6.1 chatStore 扩展 | Task 6 |
| §6.2 ToolCallBubble | Task 6 |
| §6.3 ChatMessageList 配对 | Task 6（用 tool_calls 冗余字段避免配对） |
| §7 错误处理与判据 | Task 5（错误回传 role=tool）+ Task 7（触发/拒绝验收） |
| §8 测试与验证 | Task 1-4 单测 + Task 7 端到端 |
| §10 文件改动清单 | 全部任务逐一对应 |
