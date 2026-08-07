# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## 项目概述

Pod Agent — 以智能体为核心的智慧育种桌面系统。技术栈：Tauri 2 (Rust 后端) + React 19 + TypeScript + Tailwind CSS 4 + Vite 7。

## 常用命令

为了开发效率，中途不要 build，写完全部代码后再 build。

```bash
# 所有命令在 app/ 目录下执行
cd app

# 开发模式（启动 Vite + Tauri）
npm run tauri dev

# 前端类型检查
npx tsc --noEmit

# Rust 相关（在 app/src-tauri/ 下执行）
cd src-tauri
cargo build          # 编译 Rust 后端
cargo test           # 运行 Rust 测试（含 tests/YOLO-test 的 YOLO 集成测试）
cargo clippy         # Rust lint
```

## 项目结构

```
app/
├── src/                          # 前端源码
│   ├── components/               # 公用 UI 组件（DataTable, Modal, Toggle 等）
│   ├── pages/                    # 页面组件，按功能目录组织
│   │   ├── camera/               # 相机功能
│   │   │   ├── hooks/            # useCameraPreview, useCameraActions, usePhotoViewer
│   │   │   ├── Viewfinder.tsx    # 取景器主组件
│   │   │   └── ...               # CaptureBar, PhenotypePanel, GridOverlay 等
│   │   ├── chat/                 # AI 对话（消息流 + 会话管理）
│   │   ├── excel/                # Excel 预览
│   │   ├── files/                # 文件管理
│   │   ├── home/                 # 首页
│   │   ├── settings/             # 设置页
│   │   └── tools/                # 工具页（工具调用日志查看等）
│   ├── store/                    # Zustand 状态管理，按领域独立文件
│   └── styles/                   # 全局样式 + 页面级样式
├── src-tauri/                    # Rust 后端
│   └── src/
│       ├── lib.rs                # Tauri 命令注册入口（所有 #[tauri::command] 必须在此注册）
│       ├── paths.rs              # 路径工具（统一数据根目录 {project_root}/data/）
│       ├── agent/                # 智能体
│       │   ├── session/          # 会话 CRUD（create, read, write, delete, db 模块）
│       │   └── tool/             # 工具层：execute_tool（Caller::Human/Llm）、tool_call_log、query_phenotypes
│       └── api/                  # API 实现
│           ├── camera/           # 相机：设备枚举、实时流、拍照、SQLite 持久化
│           │   └── stream.rs     # pump 回调：帧采集 + YOLO 推理（同步）
│           ├── model/
│           │   ├── llm/          # LLM 调用：多 provider、SSE 流式、thinking、tool calling（单轮闭环）
│           │   └── yolo/         # YOLO 检测：预处理(letterbox) + 推理 + 坐标映射
│           ├── file/             # 文件操作
│           └── DB/               # 数据库读写
└── design/                       # 设计稿参考
```

**项目根目录其它**：
- `data/` — 统一数据根目录（运行时生成，已 gitignore）：`config.json`、`sessions.db`、`photos/`、`models/`
- `docs/superpowers/{plans,specs}/` — 设计稿与实施计划，命名 `YYYY-MM-DD-主题.md`
- `tests/YOLO-test/` — 独立 YOLO 集成测试 crate，主 `Cargo.toml` 通过 `[[test]] path = "../../tests/YOLO-test/yolo_integration.rs"` 引用，`cargo test` 会一并执行
- `yolov12/` — YOLO 模型源码/训练相关（已 gitignore）

## 架构要点

- **前后端通信**：
  - **前端 → Rust**：`invoke()` 调用 `#[tauri::command]` 函数，所有命令在 `lib.rs` 注册
  - **Rust → 前端**：Tauri 事件系统（`app.emit()`），用于 SSE 流式响应（`llm-chunk`、`llm-thinking`、`llm-done`、`llm-tool-call`、`llm-tool-result`）
  - **实时视频流**：`Channel<T>` 传输 base64 编码的 JPEG 帧，同时携带 YOLO 检测结果

- **新增 Tauri 命令的工作流**：
  1. 在对应模块编写 `#[tauri::command]` 函数
  2. 在 `lib.rs` 顶部 `use` 导入
  3. 在 `lib.rs` 的 `invoke_handler(generate_handler![...])` 中注册
  4. 前端通过 `invoke("command_name", { args })` 调用

- **状态管理**：Zustand store 按领域拆分为独立文件（camera / chat / excel / file / settings），通过 `store/index.ts` 统一导出

- **路由**：React Router，页面路由与导航项定义在 `App.tsx`，苹果风格 44px 黑色导航栏。路由：`/`(首页)、`/chat`(智能体对话)、`/tools`(工具)、`/files`(文件管理)、`/camera`(相机)、`/excel`(数据预览)、`/settings`(设置)

- **样式**：Tailwind CSS 4（`@tailwindcss/vite` 插件集成），Apple 风格色板定义在 `global.css` 的 `@theme` 中，页面级 CSS 在 `styles/` 目录

- **Rust 核心依赖**：
  - `cameras` — 相机设备枚举与实时流（`api/camera/` 基于此 crate，非手写采集）
  - `usls` — YOLOv8 + ONNX Runtime 推理（`api/model/yolo/`）
  - `rusqlite`(bundled) — SQLite，`DbState.conn` 用 `Mutex<Connection>` 保护
  - `reqwest` + `tokio` + `futures-util` — LLM HTTP 调用与 SSE 流式解析

- **前端关键依赖**：
  - `@tanstack/react-query` — 异步数据管理
  - `react-hook-form` + `zod` — 表单与校验
  - `react-markdown` + `rehype-highlight` + `remark-gfm` — Markdown 渲染
  - `motion` — 动画（Framer Motion 继任者）
  - `three` — 3D 渲染
  - `lucide-react` — 图标库

## 模型加载

**YOLO 检测模型**（`api/model/yolo/detect/mod.rs`）：
- 前端调用 `load_yolo_model(model_path?)`，路径为空时取默认路径 `{data_dir}/models/yolov8n.onnx`
- `build_detect_config()` 构建 `usls::Config`（YOLOv8 + ONNX Runtime）
- `usls::models::YOLO::new(config)` 加载模型到 `Runtime<YOLO>`
- 模型以 `Arc<Mutex<Option<Runtime<YOLO>>>>` 形式存入全局 `CameraState.yolo`，pump 回调 clone Arc 后每 N 帧同步推理
- `unload_yolo_model()` 置 `None` 释放

**LLM 模型**（`api/model/llm/`）：
- 不加载本地权重，通过 HTTP 调用远程 API
- 配置从 `{data_dir}/config.json` 读取 `LLMConfig`（provider、api_key、endpoint、model）
- 以 OpenAI 兼容协议（`/chat/completions`）发送请求，支持 SSE 流式
- **tool calling（单轮闭环）**：首轮带 `tools`（`tool::tool_schemas()`）发送工具清单，LLM 返回 `tool_calls` 时执行 `execute_tool(Caller::Llm)` 并回填结果，第二轮**不带 tools** 强制文字总结——天然单轮单工具，无 ReAct 循环、无 `agent_runs/steps` 表。`tool_calls` 分片解析在 `receive.rs::ToolCallAccum`（独立于 reasoning 流）

## 数据存储

**统一数据根目录**：`{project_root}/data/`（由 `paths.rs` 管理）

| 数据类型 | 存储位置 | 格式 |
|---------|---------|------|
| LLM 配置 | `data/config.json` | JSON（provider、api_key、endpoint、model） |
| 会话数据库 | `data/sessions.db` | SQLite WAL 模式 |
| 原图 | `data/photos/{timestamp}.jpg` | JPEG Q=95 |
| 缩略图 | `data/photos/thumbnails/{timestamp}.jpg` | JPEG Q=80，200×200 |
| YOLO 模型 | `data/models/yolov8n.onnx` | ONNX 格式 |

**数据库表结构**（`sessions.db`，4 张表）：

- **sessions** — 会话元数据（id TEXT PK、title TEXT、created_at TEXT、updated_at TEXT）
- **messages** — 消息内容（id TEXT PK、session_id TEXT FK→sessions、role TEXT∈{user,assistant,tool}、content TEXT、thinking TEXT、tool_calls TEXT、tool_call_id TEXT、created_at TEXT），外键 ON DELETE CASCADE。assistant 带 `tool_calls`=工具调用，role=tool 带 `tool_call_id`=工具结果
- **photos** — 照片记录（id TEXT PK、file_path TEXT、thumbnail_path TEXT、captured_at TEXT、width INT、height INT、mode TEXT、detections TEXT JSON）
- **phenotypes** — 表型数据（id TEXT PK、photo_id TEXT FK→photos、class_name TEXT、count INT、avg/min/max_confidence REAL、items TEXT JSON、created_at TEXT）

## 会话数据流

**创建会话**：`create_session(title)` → UUID v4 → INSERT sessions → 返回 Session

**发送消息完整流程**（`send_llm_message`，含 tool calling 单轮闭环）：
1. INSERT 用户消息到 messages 表（先持久化，确保不丢失）
2. SELECT 加载该会话全部历史消息（含 tool_calls/tool_call_id，由 `build_openai_messages` 组装成 OpenAI messages）
3. prepend system 提示，POST `/chat/completions`（stream: true，带 `tools`）
4. 逐块解析 SSE 流（`receive::ToolCallAccum` 累积 tool_calls 分片）：
   - `reasoning_content` → `emit("llm-thinking")`
   - `content` → `emit("llm-chunk")`
5. **若返回 tool_calls**：INSERT assistant(tool_calls) → 对每个 tool_call：`emit("llm-tool-call")` → `execute_tool(Caller::Llm)`（自动写 tool_call_log）→ `emit("llm-tool-result")` → INSERT role=tool 结果 → 第二轮 POST（**不带 tools**）收最终 content/thinking → INSERT 最终 assistant
6. **若无 tool_calls**（直接回答）：INSERT assistant（content + thinking）
7. UPDATE sessions.updated_at，`emit("llm-done")` 通知前端流结束

**关键设计**：
- `DbState.conn` 用 `Mutex<Connection>` 保护，所有读写串行化
- `messages.thinking` 列存储模型推理过程（如 DeepSeek-R1），旧数据库自动 ALTER TABLE 补列
- `messages.tool_calls`/`tool_call_id` 承载 OpenAI function calling 协议，同样自动 ALTER 补列
- 工具调用单轮硬约束：第二轮不带 `tools` 物理阻止多轮；新增工具更新 `tool::tool_schemas()`（圆桌共识：第二个工具 / 多步推理 / 需回放审计出现才加 `agent_runs/steps` 表）
- 照片拍摄时同步计算表型数据：按 class_name 聚合检测结果 → 写入 phenotypes 表

## 项目工程原则

- 代码高度解耦
- 用公用组件、公有函数、公有 CSS、全局变量来降低代码量
- 性能优先，流畅优先
