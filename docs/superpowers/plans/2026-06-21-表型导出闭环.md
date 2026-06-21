# 端到端表型导出闭环 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让育种工作者「设当前批次 → 连拍一组 → 一键导出这批表型汇总 CSV」，并修复 pump 推理失败的静默错误。

**Architecture:** 承重墙纵向闭环，不依赖 LLM。photos 加 `batch_label` 维度；`capture_photo` 带归属写入；`list_batch_labels` 复用历史批次；`export_phenotypes` 在 Rust 内 SQL 聚合 + 生成 CSV（UTF-8 BOM）存 `data/exports/` 返回路径；前端常驻批次栏 + 导出按钮。`stream.rs:159` 推理失败改发 `CameraEvent::Error` + 写 `data/logs/camera_errors.jsonl`。

**Tech Stack:** Rust（rusqlite / chrono / serde_json / std::fs）、Tauri 2 命令、React 19 + TypeScript + Zustand。

## Global Constraints

- Rust 命令在 `app/src-tauri/` 下执行：`cargo test`、`cargo build`、`cargo clippy`。
- 前端命令在 `app/` 下执行：`npx tsc --noEmit`。
- 中途不 build，全部代码写完后再 `cargo build`（CLAUDE.md）。
- 错误类型沿用项目现有 `String`（不引入 `error.rs` enum，YAGNI）。
- 参数命名 camelCase（与 `Photo` 的 `#[serde(rename_all="camelCase")]` 一致；Tauri 自动 snake↔camel 转换）。
- CSV 首行带 UTF-8 BOM（`\u{FEFF}`），保证 Excel/WPS 中文不乱码。
- 不引日志框架，错误日志用 `std::fs::OpenOptions::append`。
- 提交信息 Conventional Commits + 中文，禁止任何 AI 生成字样；仅本地提交，不推送远程。
- 测试用 `crate::agent::session::db::init_db(":memory:")` 建内存库（已建好所有表）。

## File Structure

| 文件 | 职责 | 改动类型 |
|---|---|---|
| `app/src-tauri/src/paths.rs` | 新增 `get_exports_dir()` / `get_logs_dir()` | Modify |
| `app/src-tauri/src/api/camera/db.rs` | photos 加 `batch_label` 列 + 迁移测试 | Modify |
| `app/src-tauri/src/api/camera/mod.rs` | `Photo` 结构加 `batch_label` 字段 | Modify |
| `app/src-tauri/src/api/camera/media.rs` | `list_photos` 补列；`capture_photo` 加参数；新增 `list_batch_labels`/`export_phenotypes` + 聚合/CSV 纯函数 + 测试 | Modify |
| `app/src-tauri/src/api/camera/stream.rs` | `:159` 推理失败改发 Error + 写日志；日志纯函数 + 测试 | Modify |
| `app/src-tauri/src/lib.rs` | 注册 `list_batch_labels`、`export_phenotypes` | Modify |
| `app/src/store/cameraStore.ts` | `PhotoRecord` 加字段；批次状态 + actions；`capturePhoto` 传参 | Modify |
| `app/src/pages/camera/Viewfinder.tsx` | 顶部常驻批次栏 + 导出按钮 | Modify |

---

## Task 1: 数据地基 — 目录函数 + batch_label 列 + Photo 结构 + list_photos 适配

**Files:**
- Modify: `app/src-tauri/src/paths.rs`
- Modify: `app/src-tauri/src/api/camera/db.rs`
- Modify: `app/src-tauri/src/api/camera/mod.rs`
- Modify: `app/src-tauri/src/api/camera/media.rs`（仅 `list_photos`）
- Test: `app/src-tauri/src/api/camera/db.rs`（内联 `#[cfg(test)]`）

**Interfaces:**
- Produces: `paths::get_exports_dir() -> PathBuf`、`paths::get_logs_dir() -> PathBuf`；photos 表新增 `batch_label TEXT NOT NULL DEFAULT ''`；`Photo.batch_label: String`。

- [ ] **Step 1: paths.rs 新增两个目录函数**

在 `app/src-tauri/src/paths.rs` 的 `get_models_dir()` 之后、`get_data_dir_cmd` 之前插入：

```rust
/// 导出目录：{data_dir}/exports/
pub fn get_exports_dir() -> PathBuf {
    let dir = get_data_dir().join("exports");
    fs::create_dir_all(&dir).ok();
    dir
}

/// 日志目录：{data_dir}/logs/
pub fn get_logs_dir() -> PathBuf {
    let dir = get_data_dir().join("logs");
    fs::create_dir_all(&dir).ok();
    dir
}
```

- [ ] **Step 2: db.rs 给 photos 表加 batch_label 列**

在 `app/src-tauri/src/api/camera/db.rs` 的 `init_photos_table` 函数内，detections 列兼容逻辑之后、`Ok(())` 之前插入（`DEFAULT ''` 是两个单引号表示空串字面量，不要写成 `DEFAULT '')`）：

```rust
    // 兼容旧数据库：batch_label 列（照片批次归属，承重墙组织维度）
    add_column_if_missing(conn, "photos", "batch_label", "TEXT NOT NULL DEFAULT ''")?;
```

- [ ] **Step 3: mod.rs 的 Photo 结构加字段**

在 `app/src-tauri/src/api/camera/mod.rs` 的 `Photo` 结构内，`detections` 字段之后追加：

```rust
    /// 照片批次归属（用户在批次栏设置，空串=未分组）
    pub batch_label: String,
```

- [ ] **Step 4: media.rs 的 list_photos 适配新字段**

修改 `app/src-tauri/src/api/camera/media.rs` 的 `list_photos`：

SELECT 加列（`detections` 后加 `batch_label`）：

```rust
        .prepare("SELECT id, file_path, thumbnail_path, captured_at, width, height, mode, detections, batch_label FROM photos ORDER BY captured_at DESC LIMIT ?1 OFFSET ?2")
```

`query_map` 解析加字段（`detections: row.get(7)?` 之后）：

```rust
        .query_map([limit, offset], |row| {
            Ok(Photo {
                id: row.get(0)?,
                file_path: row.get(1)?,
                thumbnail_path: row.get(2)?,
                captured_at: row.get(3)?,
                width: row.get(4)?,
                height: row.get(5)?,
                mode: row.get(6)?,
                detections: row.get(7)?,
                batch_label: row.get(8)?,
            })
        })
```

- [ ] **Step 5: 写失败测试（db.rs 末尾追加）**

在 `app/src-tauri/src/api/camera/db.rs` 末尾追加：

```rust
#[cfg(test)]
mod tests {
    use crate::agent::session::db::init_db;

    #[test]
    fn photos_table_has_batch_label() {
        let state = init_db(":memory:").expect("init_db 失败");
        let conn = state.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO photos (id, file_path, thumbnail_path, captured_at, width, height, mode, batch_label) \
             VALUES ('p1','/x.jpg','/t.jpg','2026-01-01 00:00:00',1280,720,'photo','A小区-3棚')",
            [],
        )
        .expect("插入失败");
        let label: String = conn
            .query_row("SELECT batch_label FROM photos WHERE id='p1'", [], |r| r.get(0))
            .expect("查询失败");
        assert_eq!(label, "A小区-3棚");
    }
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `cd app/src-tauri && cargo test --lib api::camera::db::tests`
Expected: PASS（1 个测试）。

- [ ] **Step 7: 编译确认**

Run: `cd app/src-tauri && cargo build`
Expected: 编译通过（`Photo` 加了 `batch_label`，`list_photos` 已适配；`capture_photo` 暂用默认值 '' 不报错）。

- [ ] **Step 8: 提交**

```bash
git -C /Volumes/base/project/pod-agent add app/src-tauri/src/paths.rs app/src-tauri/src/api/camera/db.rs app/src-tauri/src/api/camera/mod.rs app/src-tauri/src/api/camera/media.rs
git -C /Volumes/base/project/pod-agent commit -m "feat(camera): photos 表新增 batch_label 列与 Photo 结构字段"
```

---

## Task 2: 归属录入 — capture_photo 加参数 + list_batch_labels 命令

**Files:**
- Modify: `app/src-tauri/src/api/camera/media.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Test: `app/src-tauri/src/api/camera/media.rs`（内联 `#[cfg(test)]`）

**Interfaces:**
- Consumes: photos 表 `batch_label` 列（Task 1）。
- Produces: `capture_photo(..., batch_label: Option<String>)`；`list_batch_labels() -> Result<Vec<String>, String>`（Tauri 命令）；内部纯函数 `distinct_batch_labels(conn: &Connection) -> Result<Vec<String>, String>`。

- [ ] **Step 1: media.rs 顶部加 use**

在 `app/src-tauri/src/api/camera/media.rs` 第 1 行 `use std::collections::HashMap;` 之后确认已有 `use rusqlite` 相关。该文件目前用全路径 `rusqlite::params!`，本任务需新增类型引用。在第 1-13 行的 use 区追加：

```rust
use rusqlite::Connection;
```

- [ ] **Step 2: capture_photo 加 batch_label 参数并入 INSERT**

修改 `capture_photo` 签名（`detections` 参数之后加 `batch_label`）：

```rust
#[tauri::command]
pub fn capture_photo(
    camera: State<'_, CameraStateMutex>,
    db: State<'_, DbState>,
    detections: Option<Vec<utils::Detection>>,
    batch_label: Option<String>,
) -> Result<CaptureResult, String> {
```

修改 INSERT 语句（原 8 列 → 9 列，加 batch_label）。在 `let detections_json = ...` 之后、`let conn = ...` 之后找到现有 INSERT，替换为：

```rust
    let batch = batch_label.unwrap_or_default();
    conn.execute(
        "INSERT INTO photos (id, file_path, thumbnail_path, captured_at, width, height, mode, detections, batch_label) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![id, photo_path_str, thumb_path_str, captured_at, frame.width, frame.height, "photo", detections_json, batch],
    )
    .map_err(|e| format!("写入照片记录失败: {}", e))?;
```

- [ ] **Step 3: 新增 distinct_batch_labels 纯函数 + list_batch_labels 命令**

在 `app/src-tauri/src/api/camera/media.rs` 末尾（`get_phenotypes` 函数之后）追加：

```rust
/// 查询所有已使用的批次标签（去重、排除空串、排序）。纯函数，可测。
fn distinct_batch_labels(conn: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT DISTINCT batch_label FROM photos WHERE batch_label != '' ORDER BY batch_label")
        .map_err(|e| format!("查询批次列表失败: {}", e))?;
    let labels: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| format!("解析批次列表失败: {}", e))?
        .filter_map(|l| l.ok())
        .collect();
    Ok(labels)
}

/// 供批次栏下拉复用历史批次。前端：invoke("list_batch_labels")
#[tauri::command]
pub fn list_batch_labels(db: State<'_, DbState>) -> Result<Vec<String>, String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
    distinct_batch_labels(&conn)
}
```

- [ ] **Step 4: lib.rs 注册 list_batch_labels**

修改 `app/src-tauri/src/lib.rs`：

第 5 行 use 区，在 `get_phenotypes` 之后加 `list_batch_labels`：

```rust
use api::camera::media::{capture_photo, load_last_photo, list_photos, read_photo_data, get_phenotypes, list_batch_labels};
```

`invoke_handler` 内，`get_phenotypes,` 之后加：

```rust
            list_batch_labels,
```

- [ ] **Step 5: 写失败测试（media.rs 末尾追加）**

在 `app/src-tauri/src/api/camera/media.rs` 末尾追加：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::session::db::init_db;

    fn insert_photo(conn: &Connection, id: &str, label: &str) {
        conn.execute(
            "INSERT INTO photos (id, file_path, thumbnail_path, captured_at, width, height, mode, batch_label) \
             VALUES (?1,'/x','/t','2026-01-01 00:00:00',1,1,'photo',?2)",
            rusqlite::params![id, label],
        )
        .unwrap();
    }

    #[test]
    fn distinct_batch_labels_sorted_no_empty() {
        let state = init_db(":memory:").expect("init_db 失败");
        let conn = state.conn.lock().unwrap();
        insert_photo(&conn, "p1", "B小区");
        insert_photo(&conn, "p2", "A小区");
        insert_photo(&conn, "p3", ""); // 空串应被排除
        insert_photo(&conn, "p4", "B小区"); // 重复应去重
        let labels = distinct_batch_labels(&conn).unwrap();
        assert_eq!(labels, vec!["A小区".to_string(), "B小区".to_string()]);
    }
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `cd app/src-tauri && cargo test --lib api::camera::media::tests`
Expected: PASS（1 个测试）。

- [ ] **Step 7: 编译 + lint**

Run: `cd app/src-tauri && cargo build`
Expected: 编译通过。

Run: `cd app/src-tauri && cargo clippy`
Expected: 无 error。

- [ ] **Step 8: 提交**

```bash
git -C /Volumes/base/project/pod-agent add app/src-tauri/src/api/camera/media.rs app/src-tauri/src/lib.rs
git -C /Volumes/base/project/pod-agent commit -m "feat(camera): capture_photo 支持 batch_label 归属录入与批次列表查询"
```

---

## Task 3: 导出核心 — export_phenotypes 命令

**Files:**
- Modify: `app/src-tauri/src/api/camera/media.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Test: `app/src-tauri/src/api/camera/media.rs`（追加到 Task 2 的 tests 模块）

**Interfaces:**
- Consumes: photos + phenotypes 表（含 batch_label 列）。
- Produces: `export_phenotypes(batch_label: Option<String>) -> Result<String, String>`；纯函数 `aggregate_phenotypes(conn, batch_label) -> Result<Vec<ExportRow>, String>`、`build_csv(rows) -> String`、`csv_escape(s) -> String`。

- [ ] **Step 1: 新增聚合 / CSV 纯函数 + export_phenotypes 命令**

在 `app/src-tauri/src/api/camera/media.rs` 的 `list_batch_labels` 之后追加：

```rust
/// 导出聚合行：批次×类别 的统计（精确 SUM/COUNT/MIN/MAX，不导出近似 avg）
struct ExportRow {
    batch_label: String,
    class_name: String,
    photo_count: i64,
    total_count: i64,
    min_conf: f32,
    max_conf: f32,
    n_low: i64,
    n_high: i64,
}

/// 按「批次×类别」聚合表型。batch_label=None 导出全部批次。纯函数，可测。
fn aggregate_phenotypes(conn: &Connection, batch_label: Option<&str>) -> Result<Vec<ExportRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT p.batch_label, ph.class_name, \
                    COUNT(DISTINCT p.id) AS photo_count, \
                    SUM(ph.count) AS total_count, \
                    MIN(ph.min_confidence) AS min_conf, \
                    MAX(ph.max_confidence) AS max_conf, \
                    SUM(ph.n_low) AS n_low, \
                    SUM(ph.n_high) AS n_high \
             FROM photos p JOIN phenotypes ph ON ph.photo_id = p.id \
             WHERE (?1 IS NULL OR p.batch_label = ?1) \
             GROUP BY p.batch_label, ph.class_name \
             ORDER BY p.batch_label, ph.class_name",
        )
        .map_err(|e| format!("准备聚合查询失败: {}", e))?;
    let rows = stmt
        .query_map([batch_label], |row| {
            Ok(ExportRow {
                batch_label: row.get(0)?,
                class_name: row.get(1)?,
                photo_count: row.get(2)?,
                total_count: row.get(3)?,
                min_conf: row.get(4)?,
                max_conf: row.get(5)?,
                n_low: row.get(6)?,
                n_high: row.get(7)?,
            })
        })
        .map_err(|e| format!("聚合查询失败: {}", e))?;
    rows.filter_map(|r| r.ok()).collect()
}

/// CSV 值转义：含逗号/引号/换行的值用双引号包裹，内部引号双写
fn csv_escape(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

/// 生成 CSV 字符串（UTF-8 BOM 开头，末尾换行）
fn build_csv(rows: &[ExportRow]) -> String {
    let header = "批次,类别,照片数,检测总数,最低置信度,最高置信度,低置信数,高置信数";
    let mut lines = vec![header.to_string()];
    for r in rows {
        lines.push(format!(
            "{},{},{},{},{},{},{},{}",
            csv_escape(&r.batch_label),
            csv_escape(&r.class_name),
            r.photo_count,
            r.total_count,
            r.min_conf,
            r.max_conf,
            r.n_low,
            r.n_high,
        ));
    }
    format!("\u{FEFF}{}\n", lines.join("\n"))
}

/// 按 batch_label 导出表型汇总 CSV。前端：invoke("export_phenotypes", { batchLabel })
/// 返回 CSV 文件路径；该批次无数据时返回 Err。
#[tauri::command]
pub fn export_phenotypes(batch_label: Option<String>, db: State<'_, DbState>) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| format!("数据库锁获取失败: {}", e))?;
    let rows = aggregate_phenotypes(&conn, batch_label.as_deref())?;
    if rows.is_empty() {
        return Err("该批次无表型数据".to_string());
    }
    let csv = build_csv(&rows);
    let dir = crate::paths::get_exports_dir();
    let now = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let path = dir.join(format!("export_{}.csv", now));
    std::fs::write(&path, csv.as_bytes()).map_err(|e| format!("写入导出文件失败: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}
```

- [ ] **Step 2: lib.rs 注册 export_phenotypes**

修改 `app/src-tauri/src/lib.rs`：

第 5 行 use 区加 `export_phenotypes`：

```rust
use api::camera::media::{capture_photo, load_last_photo, list_photos, read_photo_data, get_phenotypes, list_batch_labels, export_phenotypes};
```

`invoke_handler` 内 `list_batch_labels,` 之后加：

```rust
            export_phenotypes,
```

- [ ] **Step 3: 写失败测试（追加到 media.rs 的 tests 模块）**

在 `app/src-tauri/src/api/camera/media.rs` 的 `tests` 模块内（Task 2 的 `distinct_batch_labels_sorted_no_empty` 之后）追加：

```rust
    fn insert_phenotype(
        conn: &Connection,
        id: &str,
        photo_id: &str,
        class_name: &str,
        count: i64,
        min_conf: f32,
        max_conf: f32,
        n_low: i64,
        n_high: i64,
    ) {
        conn.execute(
            "INSERT INTO phenotypes (id, photo_id, class_name, count, avg_confidence, min_confidence, max_confidence, items, created_at, n_low, n_high, reviewed) \
             VALUES (?1,?2,?3,?4,0.8,?5,?6,'[]','2026-01-01 00:00:00',?7,?8,0)",
            rusqlite::params![id, photo_id, class_name, count, min_conf, max_conf, n_low, n_high],
        )
        .unwrap();
    }

    #[test]
    fn aggregate_groups_by_batch_and_class() {
        let state = init_db(":memory:").expect("init_db 失败");
        let conn = state.conn.lock().unwrap();
        // batch A: pa1(豆荚10, 叶5), pa2(豆荚20)；batch B: pb1(豆荚3)
        insert_photo(&conn, "pa1", "A小区");
        insert_photo(&conn, "pa2", "A小区");
        insert_photo(&conn, "pb1", "B小区");
        insert_phenotype(&conn, "x1", "pa1", "豆荚", 10, 0.8, 0.95, 1, 8);
        insert_phenotype(&conn, "x2", "pa2", "豆荚", 20, 0.7, 0.99, 2, 15);
        insert_phenotype(&conn, "x3", "pa1", "叶", 5, 0.6, 0.8, 1, 3);
        insert_phenotype(&conn, "x4", "pb1", "豆荚", 3, 0.5, 0.7, 1, 1);

        // 导出 A 小区：豆荚 + 叶 = 2 行
        let rows_a = aggregate_phenotypes(&conn, Some("A小区")).unwrap();
        assert_eq!(rows_a.len(), 2);
        let dou = rows_a.iter().find(|r| r.class_name == "豆荚").unwrap();
        assert_eq!(dou.photo_count, 2); // pa1, pa2 不重复计
        assert_eq!(dou.total_count, 30); // 10+20
        assert_eq!(dou.n_low, 3); // 1+2
        assert_eq!(dou.n_high, 23); // 8+15
        assert!((dou.min_conf - 0.7).abs() < 1e-6); // min(0.8,0.7)
        assert!((dou.max_conf - 0.99).abs() < 1e-6); // max(0.95,0.99)
        let ye = rows_a.iter().find(|r| r.class_name == "叶").unwrap();
        assert_eq!(ye.photo_count, 1);

        // 全部（None）：A豆荚、A叶、B豆荚 = 3 行
        let rows_all = aggregate_phenotypes(&conn, None).unwrap();
        assert_eq!(rows_all.len(), 3);
    }

    #[test]
    fn aggregate_empty_batch_returns_empty() {
        let state = init_db(":memory:").expect("init_db 失败");
        let conn = state.conn.lock().unwrap();
        let rows = aggregate_phenotypes(&conn, Some("不存在")).unwrap();
        assert!(rows.is_empty()); // 命令层据此返回 Err
    }

    #[test]
    fn build_csv_has_bom_and_columns() {
        let rows = vec![ExportRow {
            batch_label: "A".into(),
            class_name: "豆荚".into(),
            photo_count: 2,
            total_count: 30,
            min_conf: 0.7,
            max_conf: 0.99,
            n_low: 3,
            n_high: 23,
        }];
        let csv = build_csv(&rows);
        assert!(csv.starts_with('\u{FEFF}'), "CSV 应以 UTF-8 BOM 开头");
        assert!(csv.contains("批次,类别,照片数,检测总数,最低置信度,最高置信度,低置信数,高置信数"));
        assert!(csv.contains("A,豆荚,2,30,0.7,0.99,3,23"));
    }

    #[test]
    fn csv_escape_handles_comma_and_quote() {
        assert_eq!(csv_escape("豆荚"), "豆荚");
        assert_eq!(csv_escape("A,小区"), "\"A,小区\"");
        assert_eq!(csv_escape("a\"b"), "\"a\"\"b\"");
    }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd app/src-tauri && cargo test --lib api::camera::media::tests`
Expected: PASS（5 个测试：distinct + aggregate×2 + build_csv + csv_escape）。

- [ ] **Step 5: 编译 + lint**

Run: `cd app/src-tauri && cargo build && cargo clippy`
Expected: 编译通过，无 clippy error。

- [ ] **Step 6: 提交**

```bash
git -C /Volumes/base/project/pod-agent add app/src-tauri/src/api/camera/media.rs app/src-tauri/src/lib.rs
git -C /Volumes/base/project/pod-agent commit -m "feat(camera): 新增 export_phenotypes 按 batch 聚合导出 CSV"
```

---

## Task 4: pump 推理失败错误路径修复（stream.rs:159）

**Files:**
- Modify: `app/src-tauri/src/api/camera/stream.rs`
- Test: `app/src-tauri/src/api/camera/stream.rs`（追加到现有 tests 模块）

**Interfaces:**
- Produces: 纯函数 `write_camera_error_line(path, ts, message)`（可测）；`append_camera_error(message)`（写 `data/logs/camera_errors.jsonl`，best-effort 不 panic）。

- [ ] **Step 1: 新增日志纯函数**

在 `app/src-tauri/src/api/camera/stream.rs` 的 `CameraEvent` enum 之后、`list_cameras` 命令之前插入：

```rust
// ── 相机错误日志（best-effort，写失败不 panic）─────────────────

/// 写一行错误日志到指定 jsonl 文件（每行一个 JSON 对象）。纯函数，可测。
fn write_camera_error_line(path: &std::path::Path, ts: u128, message: &str) {
    let line = serde_json::json!({ "ts": ts, "message": message }).to_string();
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        use std::io::Write;
        let _ = writeln!(f, "{}", line);
    }
}

/// 追加一条相机错误日志到 data/logs/camera_errors.jsonl
fn append_camera_error(message: &str) {
    let path = crate::paths::get_logs_dir().join("camera_errors.jsonl");
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    write_camera_error_line(&path, ts, message);
}
```

- [ ] **Step 2: 修复 :159 推理失败分支**

在 `app/src-tauri/src/api/camera/stream.rs` 的 pump 闭包内，找到 YOLO 推理失败分支（原代码）：

```rust
                            Err(e) => {
                                println!("[YOLO] pump 推理失败: {}", e);
                            }
```

替换为：

```rust
                            Err(e) => {
                                let msg = format!("YOLO 推理失败: {}", e);
                                let _ = send_error.send(CameraEvent::Error { message: msg.clone() });
                                append_camera_error(&msg);
                            }
```

> 说明：`send_error` 已在闭包外定义（`let send_error = channel.clone();`），闭包捕获可用。推理失败现在前端能收到 Error 事件，且写入日志，取景不中断。

- [ ] **Step 3: 写测试（追加到 stream.rs 现有 tests 模块）**

在 `app/src-tauri/src/api/camera/stream.rs` 的 `#[cfg(test)] mod tests` 内，现有 `test_list_cameras` 之后追加：

```rust
    #[test]
    fn write_camera_error_line_appends_jsonl() {
        let tmp = std::env::temp_dir().join("pod_agent_camera_err_test.jsonl");
        let _ = std::fs::remove_file(&tmp);
        write_camera_error_line(&tmp, 1700000000, "推理失败: onnx error");
        write_camera_error_line(&tmp, 1700000001, "第二行");
        let content = std::fs::read_to_string(&tmp).expect("读取日志失败");
        let lines: Vec<&str> = content.trim_end().lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].contains(r#""ts":1700000000"#));
        assert!(lines[0].contains(r#""message":"推理失败: onnx error""#));
        let _ = std::fs::remove_file(&tmp);
    }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd app/src-tauri && cargo test --lib api::camera::stream::tests`
Expected: PASS（2 个测试：原 test_list_cameras + 新增日志测试）。

- [ ] **Step 5: 编译 + lint**

Run: `cd app/src-tauri && cargo build && cargo clippy`
Expected: 编译通过，无 clippy error。

- [ ] **Step 6: 提交**

```bash
git -C /Volumes/base/project/pod-agent add app/src-tauri/src/api/camera/stream.rs
git -C /Volumes/base/project/pod-agent commit -m "fix(camera): pump 推理失败改为发 Error 事件并写错误日志"
```

---

## Task 5: 前端 — cameraStore 适配 + Viewfinder 批次栏 + 导出按钮

**Files:**
- Modify: `app/src/store/cameraStore.ts`
- Modify: `app/src/pages/camera/Viewfinder.tsx`

**Interfaces:**
- Consumes: 后端命令 `capture_photo({..., batchLabel})`、`list_batch_labels()`、`export_phenotypes({ batchLabel })`；`PhotoRecord.batchLabel`。
- Produces: `cameraStore` 的 `currentBatchLabel`/`batchLabels` 状态与 `setBatchLabel`/`loadBatchLabels`/`exportPhenotypes` action；Viewfinder 顶部批次栏 + 导出按钮。

- [ ] **Step 1: cameraStore.ts 的 PhotoRecord 加字段**

在 `app/src/store/cameraStore.ts` 的 `PhotoRecord` 接口内，`detections` 之后加：

```typescript
  /** 照片批次归属（空串=未分组） */
  batchLabel: string;
```

- [ ] **Step 2: cameraStore.ts 加状态字段**

在 `CameraState` interface 内（`detections`/`detectionMs` 等检测字段附近）加：

```typescript
  // 批次归属
  currentBatchLabel: string;
  batchLabels: string[];
```

在 `CameraState` 的 Actions 区（`toggleDetection` 之后）加：

```typescript
  setBatchLabel: (label: string) => void;
  loadBatchLabels: () => Promise<void>;
  exportPhenotypes: (batchLabel?: string) => Promise<string | null>;
```

- [ ] **Step 3: cameraStore.ts 加状态初始值 + action 实现**

在 store 初始 state（`detectionMs: null,` 附近）加：

```typescript
  currentBatchLabel: "",
  batchLabels: [],
```

在 `toggleDetection` action 之后追加：

```typescript
  setBatchLabel: (label) => set({ currentBatchLabel: label }),

  loadBatchLabels: async () => {
    try {
      const labels = await invoke<string[]>("list_batch_labels");
      set({ batchLabels: labels });
    } catch (e) {
      console.error("加载批次列表失败:", e);
    }
  },

  exportPhenotypes: async (batchLabel) => {
    try {
      const target = batchLabel ?? get().currentBatchLabel;
      const path = await invoke<string>("export_phenotypes", {
        batchLabel: target || null,
      });
      return path;
    } catch (e) {
      console.error("导出失败:", e);
      return null;
    }
  },
```

- [ ] **Step 4: capturePhoto 传 batchLabel**

修改 `cameraStore.ts` 的 `capturePhoto`，在解构里加 `currentBatchLabel` 并传入 invoke：

```typescript
  capturePhoto: async () => {
    try {
      const { isDetecting, detections, currentBatchLabel } = get();
      const result = await invoke<{ photoPath: string; photoData: string; thumbnailData: string }>("capture_photo", {
        detections: isDetecting ? detections : null,
        batchLabel: currentBatchLabel || null,
      });
      set({
        lastPhotoPath: result.photoPath,
        lastPhotoData: result.photoData,
        lastThumbnailData: result.thumbnailData,
      });
      return result.photoPath;
    } catch (e) {
      console.error("拍照失败:", e);
      return null;
    }
  },
```

- [ ] **Step 5: Viewfinder.tsx 顶部加批次栏 + 导出按钮**

在 `app/src/pages/camera/Viewfinder.tsx` 中，找到取景器顶部工具区（实时检测开关按钮所在区域，通常在视频画面上方或叠加层）。在该工具区插入批次栏组件。

先在文件顶部 import 区确认有 `useCameraStore`（已有）。在组件内取状态与 action：

```tsx
const currentBatchLabel = useCameraStore((s) => s.currentBatchLabel);
const batchLabels = useCameraStore((s) => s.batchLabels);
const setBatchLabel = useCameraStore((s) => s.setBatchLabel);
const loadBatchLabels = useCameraStore((s) => s.loadBatchLabels);
const exportPhenotypes = useCameraStore((s) => s.exportPhenotypes);
```

在组件挂载时加载历史批次（放在现有 useEffect 附近，或组件初始化逻辑里）：

```tsx
useEffect(() => {
  loadBatchLabels();
}, [loadBatchLabels]);
```

在顶部工具区（与检测开关同行或紧邻）插入批次栏 JSX：

```tsx
<div className="flex items-center gap-2">
  <input
    list="batch-labels"
    value={currentBatchLabel}
    onChange={(e) => setBatchLabel(e.target.value)}
    placeholder="批次（如 A小区-3棚）"
    className="rounded-md border border-[#D1D5DB] bg-white/80 px-3 py-1.5 text-[13px] text-[#111827] outline-none focus:border-[#007AFF]"
  />
  <datalist id="batch-labels">
    {batchLabels.map((label) => (
      <option key={label} value={label} />
    ))}
  </datalist>
  <button
    disabled={!currentBatchLabel}
    onClick={async () => {
      const path = await exportPhenotypes();
      if (path) {
        alert(`已导出：${path}`);
      } else {
        alert("导出失败或该批次无表型数据");
      }
    }}
    className="rounded-md bg-[#007AFF] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
  >
    导出此批
  </button>
</div>
```

> 说明：`<datalist>` 实现下拉复用历史批次 + 可输入新值。导出按钮在 `currentBatchLabel` 为空时禁用（不导出未分组全集）。`alert` 为最小提示，后续可替换为 toast 组件（不在本期范围）。具体 className 与项目苹果风格色板保持一致（`#007AFF` 系统蓝）。

- [ ] **Step 6: 类型检查**

Run: `cd app && npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 7: 提交**

```bash
git -C /Volumes/base/project/pod-agent add app/src/store/cameraStore.ts app/src/pages/camera/Viewfinder.tsx
git -C /Volumes/base/project/pod-agent commit -m "feat(camera): 取景器新增批次归属栏与一键导出此批"
```

---

## Task 6: 端到端验收（手动，无代码改动）

**前提：** `npm run tauri dev` 能正常启动；`data/sessions.db` 可用（无则首次启动自动建）。

- [ ] **Step 1: 启动应用**

Run: `cd app && npm run tauri dev`
Expected: 应用启动，进入取景器，顶部出现批次输入框 + 导出按钮（导出按钮初始禁用）。

- [ ] **Step 2: 批次归属与导出**

在批次栏输入「A小区-3棚」，加载 YOLO 模型并开启检测，连拍 3 张含豆荚的照片。点「导出此批」。
Expected: 弹出导出路径提示；打开 `data/exports/export_*.csv`，内容含「A小区-3棚,豆荚,…」且照片数=3、检测总数与置信度边界合理；中文不乱码。

- [ ] **Step 3: 多批次隔离**

清空批次栏输入「B小区-1棚」，拍 2 张。导出此批。
Expected: 导出的 CSV 只含 B 小区数据；批次栏下拉能看到 A、B 两个历史批次。

- [ ] **Step 4: pump 错误路径**

卸载 YOLO 模型后仍开启检测（或制造推理失败），观察取景器。
Expected: 前端收到错误提示（CameraEvent::Error），取景不中断；`data/logs/camera_errors.jsonl` 新增一行 JSON 记录。

- [ ] **Step 5: 旧库兼容**

用无 batch_label 列的旧 `data/sessions.db`（如有备份）启动。
Expected: 应用正常启动，自动补列不报错。

- [ ] **Step 6: 空数据友好提示**

对无任何表型数据的新批次点导出。
Expected: 提示「导出失败或该批次无表型数据」，不生成空文件。

- [ ] **Step 7: 全量测试回归**

Run: `cd app/src-tauri && cargo test`
Expected: 所有测试 PASS（Task 1-4 新增 + 既有）。

- [ ] **Step 8: 收尾提交（如有验收中发现的修复）**

若验收中发现 bug 并修复，按语义提交；无修复则跳过。

---

## Spec Coverage

| 设计文档章节 | 覆盖任务 |
|---|---|
| §3 数据模型（batch_label 列） | Task 1 |
| §4 组件清单 - paths 目录函数 | Task 1 |
| §4 组件清单 - Photo 结构 + list_photos 适配 | Task 1 |
| §4 组件清单 - capture_photo 加参数 | Task 2 |
| §4 组件清单 - list_batch_labels 命令 | Task 2 |
| §4 组件清单 - export_phenotypes 命令 | Task 3 |
| §4 组件清单 - stream.rs:159 修复 + 日志 | Task 4 |
| §4 组件清单 - lib.rs 注册 | Task 2、Task 3 |
| §4 组件清单 - cameraStore | Task 5 |
| §4 组件清单 - Viewfinder 批次栏 + 导出 | Task 5 |
| §5 数据流（设批次→连拍→导出） | Task 2、Task 3、Task 5、Task 6 |
| §6 导出聚合 SQL + CSV(BOM) + 不导出 avg | Task 3 |
| §7 错误处理（空数据 Err / pump 发 Error + 日志 / 按钮禁用） | Task 3、Task 4、Task 5 |
| §8 测试策略 | Task 1-4 内联测试 + Task 6 端到端 |
| §10 验收标准 | Task 6 |
