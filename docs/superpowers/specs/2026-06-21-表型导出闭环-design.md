# 端到端表型导出闭环 设计

> **状态**：已通过 brainstorming 对齐，待 writing-plans 细化为实施计划
> **日期**：2026-06-21
> **范围**：承重墙纵向闭环（拍照归属 → 聚合 → 导出），不依赖 LLM

## 1. 目标

让育种工作者能完成一个端到端任务：**设当前批次 → 连拍一组 → 一键导出这批的表型汇总 CSV**。

这是把当前 MVP（"拍一张 → 存一条 → 对话问一句"）补齐为真正可交付的育种工具——照片有了归属维度，批次表型能汇总成表交差。

定位原则（工程师定调）：**agent 是工作流的增强层，不是承重墙**。本期所有改动不依赖 LLM，LLM 挂掉也要能独立完成拍照、归属、导出。

## 2. 背景

- 2026-06-20 圆桌讨论结论：pump 是唯一不套壳的部分需加固；数据动作收敛到 `batch_label`；LLM agent 方向冻结。
- 代码核实修正了圆桌的夸大判断：`stream.rs` 健壮性已较好（帧转换/JPEG 失败已发 `CameraEvent::Error`、模型 None 已静默跳过、Mutex 拿不到锁已跳过），**唯一真缺口是 `stream.rs:159` YOLO 推理失败只 `println!`**。
- `add_column_if_missing` 工具函数已存在（`db.rs:62`），加列零摩擦。
- 导出聚合可复用现有 `photos ⋈ phenotypes` 结构，无需新表。

## 3. 数据模型

唯一 schema 改动（自动兼容旧库）：

```
photos 表新增列：batch_label TEXT NOT NULL DEFAULT ''
```

- 空串 = 未分组（兼容已有照片）
- 不引入 plots 表、不加外键、不加实验设计轴（圆桌已判定为"为想象中的聚合根建模"）

## 4. 组件清单

### Rust

| 文件 | 改动类型 | 内容 |
|---|---|---|
| `app/src-tauri/src/paths.rs` | Add | `get_exports_dir()` → `data/exports/`；`get_logs_dir()` → `data/logs/`（照 `get_photos_dir` 模式 + `create_dir_all`） |
| `app/src-tauri/src/api/camera/db.rs` | Modify | `init_photos_table` 末尾加 `add_column_if_missing(conn, "photos", "batch_label", "TEXT NOT NULL DEFAULT ''")` |
| `app/src-tauri/src/api/camera/mod.rs` | Modify | `Photo` 结构加 `pub batch_label: String` 字段（`#[serde(rename_all = "camelCase")]` 已有，前端自动得到 `batchLabel`） |
| `app/src-tauri/src/api/camera/media.rs` | Modify | `capture_photo` 加 `batch_label: Option<String>` 参数并入 INSERT（None → `""`）；`list_photos` SELECT 与 Photo 解析补 `batch_label` 列 |
| `app/src-tauri/src/api/camera/media.rs` | Add | `list_batch_labels()` 命令：`SELECT DISTINCT batch_label FROM photos WHERE batch_label != '' ORDER BY batch_label` |
| `app/src-tauri/src/api/camera/media.rs` | Add | `export_phenotypes(batch_label: Option<String>)` 命令：见 §6 |
| `app/src-tauri/src/api/camera/stream.rs` | Modify | `:159` 推理失败的 `println!` → `send_error.send(CameraEvent::Error{...})` + append 一行到 `data/logs/camera_errors.jsonl` |
| `app/src-tauri/src/lib.rs` | Modify | `invoke_handler` 注册 `list_batch_labels`、`export_phenotypes` |

### 前端

| 文件 | 改动类型 | 内容 |
|---|---|---|
| `app/src/store/cameraStore.ts` | Modify | `PhotoRecord` 加 `batchLabel: string`；加状态 `currentBatchLabel: string`、`batchLabels: string[]`；加 action `setBatchLabel(s)`、`loadBatchLabels()`、`exportPhenotypes(batchLabel?)`；`capturePhoto` 传 `batchLabel` |
| `app/src/pages/camera/Viewfinder.tsx` | Modify | 顶部常驻批次栏：下拉复用历史批次 + 可输入新值；旁置「导出此批」按钮（`currentBatchLabel` 为空时禁用） |

## 5. 数据流（端到端）

1. 进取景器，批次栏默认空，下拉可选历史批次（`loadBatchLabels` → `list_batch_labels`）
2. 输入/选「A小区-3棚」→ `cameraStore.currentBatchLabel`
3. 连拍 → `capturePhoto` 带 `batchLabel` → `capture_photo` 写入 `photos.batch_label`
4. 换小区 → 改批次栏（一行动作，不打断拍摄节奏）
5. 点「导出此批」→ `export_phenotypes("A小区-3棚")` → SQL 聚合 → CSV 写 `data/exports/export_{timestamp}.csv` → 返回路径 → toast 提示并支持打开

## 6. 导出聚合设计

### 聚合 SQL

```sql
SELECT p.batch_label, ph.class_name,
       COUNT(DISTINCT p.id)   AS photo_count,
       SUM(ph.count)          AS total_count,
       MIN(ph.min_confidence) AS min_conf,
       MAX(ph.max_confidence) AS max_conf,
       SUM(ph.n_low)          AS n_low,
       SUM(ph.n_high)         AS n_high
FROM photos p
JOIN phenotypes ph ON ph.photo_id = p.id
WHERE (?1 IS NULL OR p.batch_label = ?1)
GROUP BY p.batch_label, ph.class_name
ORDER BY p.batch_label, ph.class_name
```

- `batch_label = None`（参数 `?1` 为 NULL）→ 导出全部批次（命令层留扩展点，本期 UI 不暴露）
- 指定 batch_label → 仅导该批

### CSV 格式

- 首行带 UTF-8 BOM（`\u{FEFF}`），保证 Excel/WPS 打开中文不乱码
- 表头：`批次,类别,照片数,检测总数,最低置信度,最高置信度,低置信数,高置信数`
- 文件名：`export_{yyyyMMdd_HHmmss}.csv`，存 `data/exports/`
- 数值列原样输出，不做四舍五入美化

### 诚实取舍：不导出 avg_confidence

「各照片均值再平均」是误导性近似（无法反映真实检测框分布），与项目"尊重真相、不粉饰"哲学冲突。育种员看 `min/max/n_low/n_high` 即可判断数据质量。`count/n_low/n_high` 是精确 SUM，`photo_count` 精确，`min/max` 是各照片边界的极值。若未来需要真实加权均值，应从 `phenotypes.items` JSON 展开重算，不在本期。

### 命令返回值

`export_phenotypes(batch_label: Option<String>) -> Result<String, String>`：成功返回 `Ok(csv 文件路径)`，失败返回 `Err(中文错误信息)`。前端拿路径后 toast 提示并提供打开。

## 7. 错误处理

| 场景 | 行为 |
|---|---|
| 该批次无表型数据 | `export_phenotypes` 返回 `Err("该批次无表型数据")`，前端 toast，不生成空文件 |
| CSV 写盘失败 | 返回 `Err`，前端 toast |
| UI「导出此批」在批次为空时 | 按钮禁用，不导出"未分组"全集（避免误操作） |
| pump YOLO 推理失败 | 发 `CameraEvent::Error`（前端可显示）+ append `data/logs/camera_errors.jsonl`，**不中断取景** |
| 错误类型 | 沿用项目现有 `String`，不引入 `error.rs`（YAGNI） |
| 日志格式 | 不引日志框架，用 `std::fs::OpenOptions::append`；`camera_errors.jsonl` 每行一个 JSON（时间/错误信息），append 模式 |

## 8. 测试策略

Rust 内联 `#[cfg(test)]`：

1. `export_phenotypes` 聚合正确性：内存库造 3 张照片（2 张 batch=A 且 class 不同、1 张 batch=B）+ 对应 phenotypes，验证：返回行数正确、`SUM(count)` 精确、`photo_count` 精确（同一张照片多 class 不重复计）、`min/max` 是边界极值、按 batch_label 过滤生效
2. `batch_label` 列迁移：内存库 `CREATE TABLE photos` 不预置 batch_label 列，调 `init_photos_table` 后能 INSERT 并 SELECT 回 `batch_label`
3. `list_batch_labels`：DISTINCT、排除空串、排序正确
4. CSV 生成：BOM 存在、列顺序与表头一致、空结果（无数据）不写文件而是返回 Err

前端：`npx tsc --noEmit` 通过即可（本期无前端单元测试框架，手动验收）。

## 9. 明确不做（冻结项）

- `list_photos` 工具（服务于 LLM，agent 冻结期无调用方）
- 真值通道（`corrected_count`/`reviewed_by`/`reviewed_at`，无复核 UI 前是空列）
- `.xlsx` 导出（CSV 带 BOM 已满足 Excel 打开）
- 导出图表、合格率等衍生指标（等真实数据验证定义）
- 多批次勾选导出 UI、「导出全部」UI
- agent / LLM 增强层（导出纯模板，不套 LLM）
- plots 表、实验设计轴、plot_id 收口

## 10. 验收标准（端到端）

1. 设批次「A小区-3棚」，连拍 3 张含豆荚检测的照片
2. 点「导出此批」，得到 CSV，打开后：批次/类别/照片数=3/检测总数正确/置信度边界正确
3. 设另一批次「B小区-1棚」拍 2 张，导出此批只含 B 的数据
4. 批次栏下拉能看到 A、B 两个历史批次
5. 故意触发 YOLO 推理失败（如卸载模型后检测），前端收到错误提示且取景不中断，`data/logs/camera_errors.jsonl` 有记录
6. 旧库（无 batch_label 列）启动后自动补列、不报错
7. 无表型数据的批次点导出 → 友好提示，无空文件

## 11. 约束

- Rust 命令在 `app/src-tauri/` 下：`cargo test`、`cargo build`、`cargo clippy`
- 前端命令在 `app/` 下：`npx tsc --noEmit`
- 中途不 build，全部写完后再 build（CLAUDE.md）
- 提交信息 Conventional Commits + 中文，禁止 AI 生成字样
- 仅本地提交，不推送远程
- 参数命名 camelCase（与 `Photo` 的 `#[serde(rename_all="camelCase")]` 一致）
