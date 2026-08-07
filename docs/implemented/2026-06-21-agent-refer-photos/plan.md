# Agent 引用照片能力 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 agent 通过新增 `search_photos` 工具自主检索照片（按类别/批次/数量），结果在对话流工具气泡内渲染为缩略图网格，点击联动右侧 `ChatPreview` 大图。

**Architecture:** 后端新增独立工具 `search_photos`（与 `query_phenotypes` 对称，JOIN `phenotypes`+`photos`，按 `photos.id` 去重，时间倒序），注册进单轮工具闭环。前端在 `ToolCallBubble` 内识别该工具，用新组件 `PhotoGrid` 渲染缩略图网格，点击复用现成 `setPreviewPhoto` → 右侧 `PhotoPreview`。不改消息模型、事件、DB 表。

**Tech Stack:** Rust + rusqlite + serde（后端工具层）；React 19 + TypeScript + Tailwind 4 + Zustand（前端）。

## Global Constraints

- 后端命令在 `app/src-tauri/` 执行，前端命令在 `app/` 执行。
- 工具入参/返回统一 camelCase（Rust struct 用 `#[serde(rename_all = "camelCase")]`），与 `query_phenotypes` 一致。
- **不改** `ChatMessage` 模型、Tauri 事件、DB 表结构、`send.rs` 流程。
- **不引入** vision、新事件、新 DB 表。
- 验证方式：后端用 `cargo test`（测试编译是必要的，不算 build 产物）；前端用 `npx tsc --noEmit` 类型检查；全部代码写完后才跑 `npm run tauri dev` 端到端验证（项目约定中途不 build）。
- 提交信息：中文 Conventional Commits，**禁止** AI 相关字样与 `Co-Authored-By`。

---

## File Structure

| 文件 | 操作 | 责任 |
|------|------|------|
| `app/src-tauri/src/agent/tool/search_photos.rs` | 新增 | `search_photos` 工具：`schema()` + `run()` + 单测 |
| `app/src-tauri/src/agent/tool/mod.rs` | 改 | 声明 mod、注册 `tool_schemas()`、`execute_tool` 分发 |
| `app/src/pages/chat/PhotoGrid.tsx` | 新增 | 缩略图网格组件 + `PhotoItem` 类型 |
| `app/src/pages/chat/ToolCallBubble.tsx` | 改 | `search_photos` 分支：成功时渲染 `PhotoGrid` |

---

## Task 1: `search_photos` 工具核心（run + schema + 单测）

**Files:**
- Create: `app/src-tauri/src/agent/tool/search_photos.rs`

**Interfaces:**
- Consumes: `rusqlite::Connection`（执行环境传入）、`crate::agent::session::db::init_db`（测试建库）
- Produces:
  - `pub fn run(args: &serde_json::Value, conn: &Connection) -> Result<serde_json::Value, String>`
  - `pub fn schema() -> serde_json::Value`
  - 返回结构：`{ photos: PhotoItem[], included: i64, total: i64 }`，`PhotoItem` 字段 camelCase：`photoId, className, capturedAt, filePath, thumbnailPath, width, height, mode, batchLabel, count, avgConfidence`

- [ ] **Step 1: 写失败测试**

创建 `app/src-tauri/src/agent/tool/search_photos.rs`，先只放测试：

```rust
use rusqlite::Connection;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::session::db::init_db;
    use serde_json::json;

    /// 造数据：p1(豆荚+叶片,A批次,06-01)、p2(豆荚,B批次,06-02)、p3(叶片,A批次,06-03)
    fn seed(conn: &Connection) {
        conn.execute(
            "INSERT INTO photos (id, file_path, thumbnail_path, captured_at, width, height, mode, batch_label) \
             VALUES ('p1','/p1.jpg','/t1.jpg','2026-06-01 09:00:00',1920,1080,'photo','A批次')", []).unwrap();
        conn.execute(
            "INSERT INTO photos (id, file_path, thumbnail_path, captured_at, width, height, mode, batch_label) \
             VALUES ('p2','/p2.jpg','/t2.jpg','2026-06-02 09:00:00',1920,1080,'photo','B批次')", []).unwrap();
        conn.execute(
            "INSERT INTO photos (id, file_path, thumbnail_path, captured_at, width, height, mode, batch_label) \
             VALUES ('p3','/p3.jpg','/t3.jpg','2026-06-03 09:00:00',1920,1080,'photo','A批次')", []).unwrap();
        // p1 有两个类别（验证去重）
        conn.execute(
            "INSERT INTO phenotypes (id, photo_id, class_name, count, avg_confidence, min_confidence, max_confidence, items, created_at) \
             VALUES ('ph1a','p1','豆荚',10,0.9,0.8,0.99,'[]','2026-06-01 09:00:00')", []).unwrap();
        conn.execute(
            "INSERT INTO phenotypes (id, photo_id, class_name, count, avg_confidence, min_confidence, max_confidence, items, created_at) \
             VALUES ('ph1b','p1','叶片',3,0.7,0.6,0.8,'[]','2026-06-01 09:00:00')", []).unwrap();
        conn.execute(
            "INSERT INTO phenotypes (id, photo_id, class_name, count, avg_confidence, min_confidence, max_confidence, items, created_at) \
             VALUES ('ph2','p2','豆荚',5,0.85,0.7,0.95,'[]','2026-06-02 09:00:00')", []).unwrap();
        conn.execute(
            "INSERT INTO phenotypes (id, photo_id, class_name, count, avg_confidence, min_confidence, max_confidence, items, created_at) \
             VALUES ('ph3','p3','叶片',8,0.88,0.75,0.96,'[]','2026-06-03 09:00:00')", []).unwrap();
    }

    fn open() -> std::sync::MutexGuard<'static, Connection> {
        let state = init_db(":memory:").unwrap();
        // 泄漏一次以获得 'static 生命周期，便于测试内多次借用
        let leaked = Box::leak(Box::new(state));
        let conn = leaked.conn.lock().unwrap();
        seed(&conn);
        conn
    }

    #[test]
    fn filters_by_class_name() {
        let conn = open();
        let v = run(&json!({"className":"豆荚"}), &conn).unwrap();
        let photos = v["photos"].as_array().unwrap();
        assert_eq!(photos.len(), 2);
        // 倒序：p2(06-02) 在 p1(06-01) 前
        assert_eq!(photos[0]["photoId"], "p2");
        assert_eq!(photos[1]["photoId"], "p1");
    }

    #[test]
    fn filters_by_batch_label() {
        let conn = open();
        let v = run(&json!({"batchLabel":"A批次"}), &conn).unwrap();
        let photos = v["photos"].as_array().unwrap();
        assert_eq!(photos.len(), 2);
        // A批次：p1(06-01)、p3(06-03)，倒序 p3 在前
        assert_eq!(photos[0]["photoId"], "p3");
        assert_eq!(photos[1]["photoId"], "p1");
    }

    #[test]
    fn dedupes_photo_with_multiple_classes() {
        let conn = open();
        let v = run(&json!({}), &conn).unwrap();
        let photos = v["photos"].as_array().unwrap();
        assert_eq!(photos.len(), 3);
        assert_eq!(v["total"], 3);
    }

    #[test]
    fn respects_limit_and_keeps_total() {
        let conn = open();
        let v = run(&json!({"limit":2}), &conn).unwrap();
        let photos = v["photos"].as_array().unwrap();
        assert_eq!(photos.len(), 2);
        assert_eq!(v["included"], 2);
        assert_eq!(v["total"], 3);
    }

    #[test]
    fn empty_result_when_no_match() {
        let conn = open();
        let v = run(&json!({"className":"不存在"}), &conn).unwrap();
        assert_eq!(v["photos"].as_array().unwrap().len(), 0);
        assert_eq!(v["included"], 0);
        assert_eq!(v["total"], 0);
    }

    #[test]
    fn returns_desc_by_captured_at() {
        let conn = open();
        let v = run(&json!({}), &conn).unwrap();
        let ids: Vec<&str> = v["photos"].as_array().unwrap()
            .iter().map(|p| p["photoId"].as_str().unwrap()).collect();
        assert_eq!(ids, vec!["p3", "p2", "p1"]);
    }
}
```

- [ ] **Step 2: 运行测试，确认失败（函数未定义）**

Run: `cd app/src-tauri && cargo test search_photos -- --nocapture`
Expected: 编译失败，`cannot find function run`（测试引用了尚未实现的 `run`）。

- [ ] **Step 3: 实现 run + schema**

在文件顶部（`#[cfg(test)]` 之前）补上实现：

```rust
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// search_photos 工具入参（全部可选，缺省即不过滤）
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchArgs {
    class_name: Option<String>,
    batch_label: Option<String>,
    limit: Option<u32>,
}

/// 单张照片（含表型统计 + 路径，供前端渲染缩略图与右侧大图）
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PhotoItem {
    photo_id: String,
    class_name: String,
    captured_at: String,
    file_path: String,
    thumbnail_path: String,
    width: i64,
    height: i64,
    mode: String,
    batch_label: String,
    count: i64,
    avg_confidence: f64,
}

/// 工具实现：按表型类别 / 批次检索照片，按拍摄时间倒序返回。
pub fn run(args: &Value, conn: &Connection) -> Result<Value, String> {
    let q: SearchArgs = if args.is_null() {
        SearchArgs::default()
    } else {
        serde_json::from_value(args.clone()).map_err(|e| format!("参数解析失败: {}", e))?
    };
    let limit = q.limit.unwrap_or(12).clamp(1, 50) as i64;

    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.file_path, p.thumbnail_path, p.captured_at, p.width, p.height, \
                    p.mode, p.batch_label, phe.class_name, phe.count, phe.avg_confidence \
             FROM photos p \
             JOIN phenotypes phe ON phe.photo_id = p.id \
             WHERE (?1 IS NULL OR phe.class_name = ?1) \
               AND (?2 IS NULL OR p.batch_label = ?2) \
             GROUP BY p.id \
             ORDER BY p.captured_at DESC \
             LIMIT ?3",
        )
        .map_err(|e| format!("准备查询失败: {}", e))?;

    let rows = stmt
        .query_map(
            rusqlite::params![q.class_name.as_deref(), q.batch_label.as_deref(), limit],
            |row| {
                Ok(PhotoItem {
                    photo_id: row.get(0)?,
                    file_path: row.get(1)?,
                    thumbnail_path: row.get(2)?,
                    captured_at: row.get(3)?,
                    width: row.get(4)?,
                    height: row.get(5)?,
                    mode: row.get(6)?,
                    batch_label: row.get(7)?,
                    class_name: row.get(8)?,
                    count: row.get(9)?,
                    avg_confidence: row.get(10)?,
                })
            },
        )
        .map_err(|e| format!("查询失败: {}", e))?;

    let list: Vec<PhotoItem> = rows.filter_map(|r| r.ok()).collect();
    let included = list.len() as i64;

    let total: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT p.id) FROM photos p \
             JOIN phenotypes phe ON phe.photo_id = p.id \
             WHERE (?1 IS NULL OR phe.class_name = ?1) \
               AND (?2 IS NULL OR p.batch_label = ?2)",
            rusqlite::params![q.class_name.as_deref(), q.batch_label.as_deref()],
            |row| row.get(0),
        )
        .map_err(|e| format!("统计总数失败: {}", e))?;

    Ok(json!({
        "photos": list,
        "included": included,
        "total": total,
    }))
}

/// OpenAI function calling 工具 schema（与 SearchArgs camelCase 一致）。
pub fn schema() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "search_photos",
            "description": "检索已拍摄的照片（含表型统计），按拍摄时间倒序返回。用户想看/找某类或某批次照片时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "className": {"type": "string", "description": "表型类别筛选，如'豆荚'。留空返回全部类别。"},
                    "batchLabel": {"type": "string", "description": "批次筛选（如'A小区-3棚'）。留空返回全部批次。"},
                    "limit": {"type": "integer", "description": "返回照片数上限，默认 12。"}
                }
            }
        }
    })
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd app/src-tauri && cargo test search_photos -- --nocapture`
Expected: 6 个测试全部 PASS。

- [ ] **Step 5: 提交**

```bash
cd app/src-tauri
git add src/agent/tool/search_photos.rs
git commit -m "feat(tool): 新增 search_photos 工具检索照片"
```

---

## Task 2: 注册 `search_photos` 到工具分发

**Files:**
- Modify: `app/src-tauri/src/agent/tool/mod.rs`
  - 顶部 mod 声明区（第 1-2 行附近）
  - `tool_schemas()`（约第 28-30 行）
  - `execute_tool` 的 match（约第 59-62 行）
  - `#[cfg(test)] mod tests`（文件末尾）

**Interfaces:**
- Consumes: Task 1 的 `search_photos::run` / `search_photos::schema`
- Produces: `tool_schemas()` 现返回两个 schema；`execute_tool` 能分发 `"search_photos"`；单轮闭环首轮 `tools` 含两个工具。

- [ ] **Step 1: 写失败测试**

在 `app/src-tauri/src/agent/tool/mod.rs` 的 `#[cfg(test)] mod tests` 内追加（保留现有 `schemas_include_query_phenotypes`）：

```rust
    #[test]
    fn schemas_include_search_photos() {
        let s = tool_schemas();
        let names: Vec<&str> = s.iter()
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd app/src-tauri && cargo test tool::tests -- --nocapture`
Expected: FAIL —— `search_photos` 未声明/未分发（编译错误：`could not find search_photos`，或 `execute_tool` 对未知工具返回 Err）。

- [ ] **Step 3: 注册 mod + schema + 分发**

修改 `app/src-tauri/src/agent/tool/mod.rs`：

顶部 mod 声明区，在 `pub mod query_phenotypes;` 后加一行：

```rust
pub mod db;
pub mod query_phenotypes;
pub mod search_photos;
```

`tool_schemas()` 改为：

```rust
pub fn tool_schemas() -> Vec<serde_json::Value> {
    vec![query_phenotypes::schema(), search_photos::schema()]
}
```

`execute_tool` 的 match 改为（加一个分支）：

```rust
    let result = match tool_name {
        "query_phenotypes" => query_phenotypes::run(args, conn),
        "search_photos" => search_photos::run(args, conn),
        _ => Err(format!("未知工具: {}", tool_name)),
    };
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd app/src-tauri && cargo test tool::tests -- --nocapture`
Expected: `schemas_include_query_phenotypes`、`schemas_include_search_photos`、`execute_tool_dispatches_search_photos` 全部 PASS。

- [ ] **Step 5: clippy + 提交**

Run: `cd app/src-tauri && cargo clippy -- -D warnings`（若无第三方库告警干扰则应无新告警）

```bash
cd app/src-tauri
git add src/agent/tool/mod.rs
git commit -m "feat(tool): 注册 search_photos 到工具分发"
```

---

## Task 3: 前端 `PhotoGrid` 缩略图网格组件

**Files:**
- Create: `app/src/pages/chat/PhotoGrid.tsx`

**Interfaces:**
- Consumes: `useChatStore.setPreviewPhoto`（来自 `../../store`）、`PhotoRecord` 类型（来自 `../../store`）、Tauri 命令 `read_photo_data(path: string) → base64 string`
- Produces: 默认导出 `PhotoGrid`（props: `{ photos: PhotoItem[] }`）、命名导出类型 `PhotoItem`（字段与 Task 1 返回的 camelCase 一致）

- [ ] **Step 1: 创建组件**

创建 `app/src/pages/chat/PhotoGrid.tsx`：

```tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useChatStore, type PhotoRecord } from "../../store";

/** search_photos 工具返回的单张照片（camelCase，与后端 PhotoItem 一致） */
export interface PhotoItem {
  photoId: string;
  className: string;
  capturedAt: string;
  filePath: string;
  thumbnailPath: string;
  width: number;
  height: number;
  mode: string;
  batchLabel: string;
  count: number;
  avgConfidence: number;
}

/** 工具结果中的 PhotoItem 映射为右侧预览所需的 PhotoRecord */
function toRecord(p: PhotoItem): PhotoRecord {
  return {
    id: p.photoId,
    filePath: p.filePath,
    thumbnailPath: p.thumbnailPath,
    capturedAt: p.capturedAt,
    width: p.width,
    height: p.height,
    mode: p.mode,
    detections: null,
    batchLabel: p.batchLabel,
  };
}

export default function PhotoGrid({ photos }: { photos: PhotoItem[] }) {
  const setPreviewPhoto = useChatStore((s) => s.setPreviewPhoto);

  if (photos.length === 0) {
    return <p className="text-[12px] text-[#9CA3AF]">未找到照片</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((p) => (
        <Thumb key={p.photoId} item={p} onClick={() => setPreviewPhoto(toRecord(p))} />
      ))}
    </div>
  );
}

function Thumb({ item, onClick }: { item: PhotoItem; onClick: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    invoke<string>("read_photo_data", { path: item.thumbnailPath })
      .then((b64) => setSrc(b64))
      .catch(() => setFailed(true));
  }, [item.thumbnailPath]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-[#E5E7EB] bg-white hover:border-[#8B5CF6]"
    >
      {src && !failed ? (
        <img
          src={`data:image/jpeg;base64,${src}`}
          alt={item.className}
          className="h-full w-full object-cover"
        />
      ) : failed ? (
        <span className="text-[10px] text-[#9CA3AF]">加载失败</span>
      ) : (
        <span className="text-[10px] text-[#9CA3AF]">…</span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `cd app && npx tsc --noEmit`
Expected: PASS，无错误（`PhotoGrid` 当前未被引用，但 TS 不报未使用文件）。

- [ ] **Step 3: 提交**

```bash
cd app
git add src/pages/chat/PhotoGrid.tsx
git commit -m "feat(chat): 新增 PhotoGrid 缩略图网格组件"
```

---

## Task 4: `ToolCallBubble` 集成 + 端到端验证

**Files:**
- Modify: `app/src/pages/chat/ToolCallBubble.tsx`
  - 顶部 import 区（第 1-4 行附近）
  - 解析结果后、`expanded` 渲染块内（约第 66-85 行）

**Interfaces:**
- Consumes: Task 3 的 `PhotoGrid` + `PhotoItem`；现有 `ToolCallBubble` 的 `name`/`resultParsed`/`status`
- Produces: 当工具名为 `search_photos` 且成功时，结果区渲染 `PhotoGrid`（替代 JSON pre 块）；其余情况不变。

- [ ] **Step 1: 接入 `PhotoGrid`**

修改 `app/src/pages/chat/ToolCallBubble.tsx`。

顶部 import 区加一行（在现有 import 之后）：

```tsx
import PhotoGrid, { type PhotoItem } from "./PhotoGrid";
```

在 `const running = !msg.content;` 之后、`const status` 之前（即推断完 resultParsed 之后），插入照片分支判断：

```tsx
  const isPhotoSearch = name === "search_photos";
  const photos: PhotoItem[] =
    isPhotoSearch && isObject && !failed
      ? ((resultParsed as { photos?: PhotoItem[] }).photos ?? [])
      : [];
```

在 `expanded &&` 的「结果」块内，把 `<pre>` 替换为条件渲染。即把：

```tsx
              {!running && (
                <div>
                  <div className="mb-0.5 text-[#9CA3AF]">
                    {status === "failed" ? "错误" : "结果"}
                  </div>
                  <pre className="overflow-auto whitespace-pre-wrap break-all font-mono text-[#374151]">
                    {JSON.stringify(resultParsed, null, 2)}
                  </pre>
                </div>
              )}
```

改为：

```tsx
              {!running && (
                <div>
                  <div className="mb-0.5 text-[#9CA3AF]">
                    {status === "failed" ? "错误" : "结果"}
                  </div>
                  {isPhotoSearch && !failed ? (
                    <PhotoGrid photos={photos} />
                  ) : (
                    <pre className="overflow-auto whitespace-pre-wrap break-all font-mono text-[#374151]">
                      {JSON.stringify(resultParsed, null, 2)}
                    </pre>
                  )}
                </div>
              )}
```

- [ ] **Step 2: 类型检查**

Run: `cd app && npx tsc --noEmit`
Expected: PASS。

- [ ] **Step 3: 提交**

```bash
cd app
git add src/pages/chat/ToolCallBubble.tsx
git commit -m "feat(chat): 工具气泡对 search_photos 渲染缩略图网格"
```

- [ ] **Step 4: 端到端手动验证（全部代码写完后）**

Run: `cd app && npm run tauri dev`

验证步骤：
1. 先在「相机」页拍至少两张照片（确保 `photos`+`phenotypes` 有数据，含不同类别/批次更佳）。
2. 进入「智能体对话」，发问：「最近拍的豆荚照片有哪些？」（或库里实际存在的类别）。
3. 预期：对话流出现 `search_photos` 工具气泡，展开后是**缩略图网格**（非 JSON）。
4. 点击任一缩略图：右侧 `ChatPreview` 展开**大图 + 元信息**（拍摄时间、尺寸、模式）。
5. 点右侧 × 关闭，再点缩略图能重新打开。
6. 边界：问一个不存在的类别（如「恐龙照片」），网格显示「未找到照片」。

若 LLM 没主动调用 `search_photos`：检查 `data/config.json` 的模型是否支持 function calling；可换更明确的提问（如「列出批次 A 的照片」）。

- [ ] **Step 5: 全量回归测试**

Run: `cd app/src-tauri && cargo test`
Expected: 全部 PASS（含 `search_photos`、`query_phenotypes`、`execute_tool` 分发、既有测试）。

---

## Self-Review 结论

- **Spec 覆盖**：§1 后端工具 → Task 1+2；§2 前端网格+联动 → Task 3+4；§3 数据流 → Task 4 验证；§4 错误处理 → Task 1（空结果/查询失败复用 `{error}`）+ Task 3（单张加载失败降级）+ Task 4（未找到空态）；§5 测试 → Task 1 后端单测 + Task 4 端到端。无遗漏。
- **占位符**：无 TBD/TODO，每步含完整代码与命令。
- **类型一致**：`PhotoItem` 字段在后端 `#[serde(rename_all="camelCase")]`、Task 3 接口、Task 4 解析三处一致（`photoId/className/...`）；`run`/`schema` 签名 Task 1 定义、Task 2 消费一致。
- **YAGNI**：未引入 vision/新事件/新表/置信度筛选/Top-N。
