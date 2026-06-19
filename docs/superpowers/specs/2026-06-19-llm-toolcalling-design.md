# LLM Tool Calling 接通设计（chat 单轮闭环）

> 日期：2026-06-19
> 状态：设计待审
> 关联：圆桌讨论《下一步 Pod Agent 的 agent 开发方向》第 3 步

## 1. 背景与目标

Pod Agent 已具备：

- 工具层 `execute_tool(caller, tool_name, args, session_id, conn)`：统一入口，`Caller::Llm` 分支已就位，调用即自动写 `tool_call_log`（`start_call` + `finish_call`）。
- 已注册工具 `query_phenotypes`：返回表型聚合 `{rows, included, total}`，每行含 `reviewed`/`n_low`/`n_high` 真相字段（commit `76bc25d`）。
- chat 流式对话 `send_llm_message`：OpenAI 兼容 SSE，已支持 `llm-chunk`/`llm-thinking`/`llm-done`。

缺口（本次要补）：`send.rs` **零 function calling 能力**——请求体无 `tools` 字段（`send.rs:94-98`）、SSE 解析只处理 `content`/`reasoning_content`、`messages` 表无 `tool_calls`/`tool_call_id` 列。LLM 不知道有工具，也无法发起调用。

**目标**：让 chat 对话中的 LLM（DeepSeek-V3）能自主调用 `query_phenotypes`，结果回填后用自然语言作答，形成单轮闭环。前端以独立工具气泡呈现调用过程。

## 2. 已确认决策

| 维度 | 决定 | 依据 |
|---|---|---|
| 范围 | chat 单轮闭环（单轮 = 最多一轮工具调用，非 ReAct） | 圆桌共识 1 |
| 模型 | DeepSeek-V3 (`deepseek-chat`)，复用现有 `config`，不切模型、不做模型分离 | V3 原生支持 OpenAI function calling |
| 前端 | 独立工具气泡（工具名/参数/结果/状态，与 `tool_call_log` 对齐） | 工程师确认 |
| 架构 | 方案 1：`send.rs` 内联单轮闭环 + `receive.rs` 承担 `tool_calls` 解析分离；第二轮不带 `tools` 实现单轮硬约束 | 最小改动、不新增文件/表 |
| `agent.rs` | 保持空 | 圆桌 YAGNI：schema 跟着行为长 |
| 新表 | 无（`messages` 加两列扛单轮） | 圆桌共识 5 |

## 3. 单轮闭环数据流

```
用户消息
  │
  ▼
[第一轮] POST /chat/completions
   messages = [system, ...history, user]
   tools    = [query_phenotypes schema]
   stream   = true
   │  SSE 累积：content / reasoning_content / tool_calls（receive.rs 解析）
   ▼
finish_reason == "tool_calls" ?
   │
   ├─ 否（直接回答）→ 持久化 assistant(content, thinking) → emit llm-done → 结束
   │
   └─ 是 → 持久化 assistant(content="", thinking, tool_calls)
            │  对每个 tool_call：
            │    emit llm-tool-call(name, args, tool_call_id)
            │    result = execute_tool(Caller::Llm, name, args, Some(session), &conn)  // 自动写 tool_call_log
            │    emit llm-tool-result(tool_call_id, result)
            │    持久化 role=tool(tool_call_id, content=result_json)
            ▼
[第二轮] POST /chat/completions
   messages = [system, ...history, user, assistant(tool_calls), tool(结果)...]
   tools    = []  ← 不带，强制文字总结
   stream   = true
   │  SSE 累积：最终 content / thinking
   ▼
持久化 assistant(final_content, final_thinking) → emit llm-done → 结束
```

**关键设计**：第二轮请求**不带 `tools`** → 模型只能用文字总结工具结果 → 天然实现"单轮单工具"硬约束，无需循环计数器、无需 `agent_runs/steps` 表。

说明：第一轮若返回 `tool_calls`，其 `content` 通常为空（调工具场景）；非空时并入最终 assistant 消息，不单独渲染。

## 4. 数据库 schema 扩展

`messages` 表加两列，沿用 `init_db` 现有 ALTER 兼容模式（`db.rs:43-49`：`prepare("SELECT col FROM messages LIMIT 0").is_ok()` 检测，缺失则 ADD COLUMN）：

```sql
ALTER TABLE messages ADD COLUMN tool_calls TEXT NOT NULL DEFAULT '';    -- assistant 工具调用 JSON 数组
ALTER TABLE messages ADD COLUMN tool_call_id TEXT NOT NULL DEFAULT '';  -- role=tool 消息的 tool_call_id
```

消息形态扩展：

- `role='assistant'` + `tool_calls` 非空：工具调用消息（`content` 可空）。
- `role='tool'` + `tool_call_id` 非空：工具结果消息（`content` = 结果 JSON）。
- `role='user'` / 普通 `assistant`：不变。

`load_history`（`send.rs:29`）改造：SELECT 增加 `tool_calls, tool_call_id`，组装成 OpenAI messages：

- `assistant` + `tool_calls` → `{role:"assistant", content, tool_calls:<parsed>}`
- `tool` → `{role:"tool", tool_call_id, content}`
- 其他 → `{role, content}`

## 5. 后端实现

### 5.1 `receive.rs`：tool_calls 分片解析（新增，不动原解析器）

OpenAI 流式 tool_calls 格式（DeepSeek-V3 兼容）：

```jsonc
// 首片：带 id / name / arguments 起始
{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_x","type":"function","function":{"name":"query_phenotypes","arguments":"{\"class"}}]}}]}
// 后续片：仅 arguments 增量
{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"Name\":\"豆荚\"}"}}]}}]}
```

新增累积器，按 `index` 拼接 `arguments` 字符串，流结束整体解析：

```rust
pub struct ToolCallAccum { /* 内部按 index 累积 id / name / arguments_buf */ }
impl ToolCallAccum {
    pub fn feed(&mut self, delta: &Value);        // 喂入每个 delta.tool_calls 片段
    pub fn finish(self) -> Vec<ParsedToolCall>;   // 流结束组装完整 tool_calls
}
pub struct ParsedToolCall { pub id: String, pub name: String, pub arguments: Value }
```

单测覆盖：跨 chunk 断行、arguments 含转义引号、多 tool_call（多 `index`）。

### 5.2 `tool/mod.rs` + `query_phenotypes.rs`：工具 schema 聚合（新增）

每个工具模块自带 schema，`tool/mod.rs` 聚合，集中管理、未来加工具只改一处：

```rust
// query_phenotypes.rs
pub fn schema() -> Value { json!({
    "type": "function",
    "function": {
        "name": "query_phenotypes",
        "description": "查询已拍摄照片的表型统计聚合（数量、置信度、人工复核情况）。用户问某类别数量/置信度/可信度时调用。",
        "parameters": {
            "type": "object",
            "properties": {
                "className": {"type":"string","description":"表型类别，如'豆荚'。留空返回全部类别。"},
                "photoId":   {"type":"string","description":"限定某张照片。通常留空。"},
                "limit":     {"type":"integer","description":"返回行数上限，默认 50。"}
            }
        }
    }
})}

// tool/mod.rs
pub fn tool_schemas() -> Vec<Value> { vec![query_phenotypes::schema()] }
```

参数用 **camelCase**，与 `QueryArgs` 的 `#[serde(rename_all="camelCase")]` 一致（`query_phenotypes.rs:7`）。

### 5.3 `send.rs`：单轮闭环编排

- 抽出 `stream_request(messages, tools: Option<&[Value]>) -> (content, thinking, tool_calls)` 复用 HTTP/SSE 底层逻辑。
- `send_llm_message` 编排：
  1. prepend system 消息（见 5.4）。
  2. 第一轮 `stream_request(messages, Some(&tool::tool_schemas()))`。
  3. `tool_calls` 为空 → 持久化 assistant，emit `llm-done`，返回。
  4. `tool_calls` 非空 → 持久化 assistant(`tool_calls`) → 遍历：emit `llm-tool-call` → `execute_tool(Caller::Llm, ...)` → emit `llm-tool-result` → 持久化 `role=tool` → 第二轮 `stream_request(messages, None)` → 持久化最终 assistant → emit `llm-done`。
- `insert_message`（`send.rs:45`）扩展：支持写入 `tool_calls` / `tool_call_id`。

### 5.4 系统提示词（新增，首轮 prepend）

当前 `send.rs` 无 system 消息。首轮注入（让 LLM 知道工具与数据可信度语义）：

```
你是 Pod Agent 育种助手。可调用 query_phenotypes 查询已拍照片的表型统计。
返回字段含义：count=检测数、avg_confidence=平均置信度、reviewed=人工复核数、n_low=低置信检测数、n_high=高置信检测数。
规则：当 reviewed 为 0 或样本量很少时，必须在回答中明确"数据未经人工复核，结论仅供参考"。不臆测没有的数据。
```

呼应圆桌：`reviewed` 是 agent "敢说不确定"的物理载体。

## 6. 前端实现

### 6.1 `chatStore.ts` 扩展

- `ChatMessage` 加 `tool_calls?: string`、`tool_call_id?: string`。
- `sendMessage`（`chatStore.ts:154`）新增事件监听：
  - `llm-tool-call` `{session_id, tool_call_id, name, args}` → 插入临时工具气泡（status=调用中）。
  - `llm-tool-result` `{session_id, tool_call_id, result}` → 更新工具气泡结果（status=完成）。
- 实时顺序：`user` → 工具气泡 → assistant 最终答案气泡（`llm-chunk` 流入）。
- `llm-done` 后 `loadMessages` 用持久化数据替换临时态。

### 6.2 `ToolCallBubble.tsx`（新增，`pages/chat/`）

独立气泡，显示：工具名、参数 JSON、结果 JSON（折叠）、状态徽标（调用中 / ✓完成 / ✗错误）。样式参照 `MessageBubble` 的 `ThinkingBlock` 折叠风格（`MessageBubble.tsx:6-26`）。

### 6.3 `ChatMessageList.tsx` 适配

遍历 messages，配对渲染：

- 遇到 `role='tool'` 消息 → 渲染 `ToolCallBubble`：name/args 从同会话前一条 `assistant.tool_calls`（按 `tool_call_id` 匹配）取，result 从当前 `role=tool.content` 取。
- 普通消息走原逻辑。

## 7. 错误处理与判据

- 工具执行失败（`execute_tool` 返回 `Err`）：错误字符串作为 `role=tool` 的 `content` 回传 LLM → LLM 应回"查询失败/没找到"（编程手"拒绝"判据）。
- LLM 返回未知工具名 / args 解析失败：`execute_tool` 返回"未知工具"错误，同样回传，LLM 自行纠正或说明。
- 网络 / HTTP 错误：维持现有 `String` 错误向上返回。

**第一版验收判据**（编程手三判据，过"触发+拒绝"两条）：

- **触发**：问"今年豆荚拍了多少" → LLM 自主调 `query_phenotypes`。
- **拒绝**：查无数据的类别 / 工具返回空 → LLM 回"没找到符合条件的记录"而非编造。

## 8. 测试与验证

- **Rust 单测**：
  - `receive.rs::ToolCallAccum`：构造跨 chunk 的 delta 序列（首片带 id/name，后续仅 arguments 增量），验证 `finish()` 组装正确；覆盖 arguments 含转义引号、多 tool_call（多 `index`）。
  - `load_history` 组装 OpenAI messages（`assistant.tool_calls` / `role=tool` 正确序列化）。
- **手动端到端**（`npm run tauri dev`）：
  1. 问"今年豆荚拍了多少" → 见工具气泡（调用中→✓完成）→ 自然语言作答。
  2. 问一个无数据类别 → LLM 回"没找到"（拒绝判据）。
  3. 进入工具调用页面，确认 `caller=llm` 记录已入库 `tool_call_log`。
  4. 重开会话，历史中工具气泡正确渲染（持久化验证）。

## 9. YAGNI 清单（明确不做）

- `agent_runs` / `agent_steps` 表（圆桌建模手三判据未触发）。
- ReAct 多轮循环（第二轮不带 `tools` 已实现单轮）。
- `agent.rs` 编排层（保持空）。
- `confidence_dist` 直方图 / per-class 阈值配置（圆桌延后）。
- 对话/agent 模型分离（`agentModel` 字段继续闲置；V3 单模型足够）。
- Anthropic provider 的 tool calling（其协议非 OpenAI 兼容，本次只保证 DeepSeek/OpenAI）。
- 独立 `error.rs` enum（`send.rs` 就近用 `String` + 局部处理）。

## 10. 文件改动清单

**后端**（`app/src-tauri/src/`）：

| 文件 | 改动 |
|---|---|
| `api/model/llm/receive.rs` | + `ToolCallAccum` / `ParsedToolCall`（tool_calls 分片解析） |
| `api/model/llm/send.rs` | 抽 `stream_request`；`send_llm_message` 编排单轮闭环；`load_history`/`insert_message` 支持 tool_calls/tool_call_id；新增 `llm-tool-call`/`llm-tool-result` 事件 |
| `agent/session/db.rs` | `messages` 加 `tool_calls`/`tool_call_id` 两列（ALTER 兼容） |
| `agent/session/mod.rs` | `Message` 结构加 `tool_calls`/`tool_call_id` 字段 |
| `agent/session/read.rs` | `get_messages` SELECT 并反序列化 `tool_calls`/`tool_call_id`（持久化渲染必需） |
| `agent/session/create.rs` | `create_message` 构造 `Message` 时补新字段默认值 |
| `agent/tool/mod.rs` | + `tool_schemas()` |
| `agent/tool/query_phenotypes.rs` | + `schema()` |

**前端**（`app/src/`）：

| 文件 | 改动 |
|---|---|
| `store/chatStore.ts` | `ChatMessage` 加字段；`sendMessage` 监听 `llm-tool-call`/`llm-tool-result` |
| `pages/chat/ToolCallBubble.tsx` | 新组件 |
| `pages/chat/ChatMessageList.tsx` | tool 气泡渲染 + 配对 |

**无新增 Tauri 命令**（复用 `send_llm_message`）；**无新增数据表**。
