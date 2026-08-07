# Agent 引用照片能力设计

> 日期：2026-06-21
> 状态：已批准（brainstorming），待实施

## 背景与目标

让 agent 能在对话中**自主检索并引用照片**，并把选中照片**呈现在对话流（缩略图）与右侧协作面板（大图）**。

现状（探查结论）：

- 右侧「协作」面板 = `ChatPreview`，其照片大图预览链路已通（`PhotoPreview` 子组件 + `setPreviewPhoto`），但**只能从左侧会话栏点照片触发**，对话流内无入口。
- 对话消息当前是纯文本：`ChatMessage` 仅有 `content/thinking/tool_calls/tool_call_id`，`MessageBubble` 不渲染图。
- agent 唯一工具 `query_phenotypes` 只返回文字表型（含 `photo_id`），既看不到图、也无法把图送到前端。
- `attachedFiles` 状态在 store 定义但**无组件接线**（空壳，本次不涉及）。

## 已定约束（brainstorming 决策）

| 维度 | 决策 |
|------|------|
| 选择主体 | **agent 自主引用**（无需 vision 看图，只返回 `photo_id` + 元数据，前端渲染） |
| 呈现位置 | **流内缩略图 + 右侧大图联动**（点缩略图在右侧 `ChatPreview` 展开大图） |
| 筛选维度 | **表型类别 + 时间/批次**（不做置信度筛选、不做 Top-N，守 YAGNI） |
| 实现方案 | **方案 A**：新增独立 `search_photos` 工具，结果复用工具气泡渲染 |

## 方案选型

- **方案 A（采用）**：新增独立 `search_photos` 工具，结果在现有 `ToolCallBubble` 内渲染为缩略图网格，点击联动右侧 `PhotoPreview`。改动最小、复用最充分、职责单一，正好落地项目「第二个工具」。
- 方案 B（否决）：新增工具 + 独立「照片消息」类型 + 新事件。要扩 `ChatMessage` 模型与新渲染分支，破坏现有纯文本模型简洁性。
- 方案 C（否决）：扩展 `query_phenotypes` 加 `includePhotos`。违反单一职责，返回结构复杂。

## 详细设计

### §1 后端：新增 `search_photos` 工具

新文件 `app/src-tauri/src/agent/tool/search_photos.rs`，与 `query_phenotypes.rs` 对称（独立文件、`schema()` + `run()`）。

**入参**（camelCase，与 `query_phenotypes` 一致）：

- `className?: string` — 表型类别筛选（如「豆荚」），留空返回全部类别。
- `batchLabel?: string` — 批次筛选（`photos.batch_label`，承重墙组织维度，已有数据）。
- `limit?: number` — 返回上限，默认 12，clamp 1–50。固定按 `captured_at DESC`（最新在前），「最近 N 张」即 `limit`。

**查询**（JOIN `phenotypes`，按 `photos.id` 去重）：

```sql
SELECT p.id, p.file_path, p.thumbnail_path, p.captured_at, p.width, p.height, p.mode, p.batch_label,
       phe.class_name, phe.count, phe.avg_confidence
FROM photos p
JOIN phenotypes phe ON phe.photo_id = p.id
WHERE (?1 IS NULL OR phe.class_name = ?1)
  AND (?2 IS NULL OR p.batch_label = ?2)
GROUP BY p.id
ORDER BY p.captured_at DESC
LIMIT ?3
```

> `GROUP BY p.id` 实现按照片去重；一张照片多类别时取其中一行（SQLite 行内取值），满足「一张照片只返回一次」。

**返回**：

```json
{
  "photos": [
    {
      "photoId": "...",
      "className": "豆荚",
      "capturedAt": "2026-06-21 10:00:00",
      "filePath": "...",
      "thumbnailPath": "...",
      "width": 1920, "height": 1080,
      "mode": "photo",
      "batchLabel": "A 批次",
      "count": 12, "avgConfidence": 0.88
    }
  ],
  "included": 5,
  "total": 23
}
```

返回字段覆盖 `PhotoRecord` 全部字段（`detections` 除外），前端可直接构造 `PhotoRecord` 调 `setPreviewPhoto`。

**注册**（`app/src-tauri/src/agent/tool/mod.rs`）：

- `tool_schemas()` 追加 `search_photos::schema()`。
- `execute_tool` 的 match 增加 `"search_photos" => search_photos::run(args, conn)` 分支。
- `pub mod search_photos;`。

单轮闭环不变：首轮 `tools` 现含两个工具（`query_phenotypes` + `search_photos`），LLM 自行选用；第二轮不带 `tools` 强制文字总结。

### §2 前端：工具气泡照片网格 + 右侧联动

- **`ToolCallBubble.tsx`** 增加 `search_photos` 分支：当 `name === "search_photos"` 且结果含 `photos` 时，渲染**缩略图网格**替代默认 JSON pre 块。
- 新增小组件 **`PhotoGrid.tsx`**（`app/src/pages/chat/`）：接收 `photos` 数组，边界清晰、可独立理解。每格用 `thumbnailPath` 调 `read_photo_data` 取 base64（并行加载，单张失败降级占位、不阻塞网格）。
- **点击联动**：点缩略图 → 用结果字段构造 `PhotoRecord`（`detections: null`）→ `setPreviewPhoto()` → 触发现成右侧 `ChatPreview`/`PhotoPreview` 大图。
- `AgentChat.tsx:27` 的 `(previewPhotoMeta) && viewMode !== "split"` 会自动让右侧面板出现，**无需新事件、无需切 viewMode**。

### §3 端到端数据流

1. 用户问「最近拍的豆荚照片」
2. `send_llm_message` → LLM 调 `search_photos({className:"豆荚", limit:10})`
3. emit `llm-tool-call` → 前端插工具气泡（running）
4. `execute_tool` JOIN 查询 → emit `llm-tool-result`（photos 数组）→ 前端更新气泡 content
5. `ToolCallBubble` 识别 `search_photos` → `PhotoGrid` 渲染缩略图网格
6. 第二轮 LLM（不带 tools）文字总结
7. 用户点缩略图 → `setPreviewPhoto` → 右侧大图

### §4 错误处理与边界

- 查询失败 → 返回 `{error}`，复用 `ToolCallBubble` 已有 failed 状态。
- 无匹配 → `{photos:[], included:0, total:0}`，网格显示「未找到照片」空态。
- 单张缩略图加载失败 → 该格占位，不阻塞其余。
- 一张照片多类别 → 去重只返回一次。

## 测试与验证

**后端单测**（仿 `query_phenotypes.rs` 测试风格，内存 SQLite）：

- `className` 过滤命中/不命中
- `batchLabel` 过滤命中/不命中
- `limit` 截断与 clamp
- 按 `captured_at DESC` 顺序
- 空结果返回 `{photos:[], included:0, total:0}`
- 一张照片多类别只返回一次（去重）
- `tool_schemas()` 含 `search_photos`

**前端**（项目无前端测试框架，手动验证）：

1. `cd app && npm run tauri dev`
2. 在对话页问 agent「最近拍的豆荚照片有哪些」
3. 确认工具气泡出现缩略图网格（非 JSON）
4. 点缩略图，确认右侧 `ChatPreview` 展开大图 + 元信息
5. 关闭右侧（×），确认可重新点开

## 涉及文件清单

| 文件 | 操作 |
|------|------|
| `app/src-tauri/src/agent/tool/search_photos.rs` | 新增 |
| `app/src-tauri/src/agent/tool/mod.rs` | 改：注册 schema + execute_tool 分发 + mod 声明 |
| `app/src/pages/chat/ToolCallBubble.tsx` | 改：`search_photos` 分支 |
| `app/src/pages/chat/PhotoGrid.tsx` | 新增：缩略图网格小组件 |

不改：`ChatMessage` 模型、Tauri 事件、DB 表结构、`send.rs` 流程、`cameraStore`。

## 不做项（YAGNI）

- 不引入 vision（agent 不看图，仅引用）。
- 不扩 `ChatMessage` 模型、不加新事件类型。
- 不加新 DB 表。
- 不做置信度筛选、不做 Top-N 排序。
- 不做 `since/until` 时间区间（`limit` + 时间倒序已覆盖「最近 N 张」）。
