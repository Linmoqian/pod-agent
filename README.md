# Pod Agent

**以智能体为核心的智慧育种桌面系统。**

通过 AI 智能体（LLM 对话 + 工具调用）+ 实时视觉识别（YOLO 检测）的组合，帮助育种工作者进行作物表型数据采集、分析与归档。

## 核心能力

- **AI 对话（智能体）**：流式回复 + 模型思考过程展示，可自主调用工具（查询表型数据、检索照片）形成单轮闭环
- **相机 + YOLO 实时检测**：接入摄像头实时取流，YOLOv8 同步推理识别作物目标，叠加检测框
- **表型数据采集**：拍照即出表型（按类别聚合 count / 置信度 / 位置），落库 SQLite
- **批量管理**：按批次标签组织照片，端到端导出表型汇总 CSV（UTF-8 BOM，Excel/WPS 可读）
- **文件 / Excel 管理**：照片、数据文件的统一管理

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri 2（Rust 后端） |
| 前端 | React 19 + TypeScript + Vite 7 + Tailwind CSS 4 |
| 状态管理 | Zustand（按领域拆分） |
| 异步数据 | TanStack Query |
| 后端推理 | `usls`（YOLOv8 + ONNX Runtime）、`cameras`（实时流） |
| 数据存储 | SQLite（WAL 模式，rusqlite） |
| LLM | 远程 API（OpenAI 兼容协议，多 provider）+ SSE 流式 |

## 快速开始

```bash
# 依赖安装在 app/ 下
cd app
npm install

# 开发模式（启动 Vite + Tauri）
npm run tauri dev

# 前端类型检查
npx tsc --noEmit

# Rust 后端（在 app/src-tauri/ 下）
cd src-tauri
cargo build   # 编译
cargo test    # 测试（含 tests/YOLO-test 集成测试）
cargo clippy  # lint
```

> **开发约定**：中途不 build，全部代码写完后再编译。

## 目录结构

```
app/
├── src/                 # 前端源码
│   ├── components/      # 公用 UI 组件
│   ├── pages/           # 页面组件（camera / chat / excel / files / home / settings / tools）
│   ├── store/           # Zustand 状态管理（按领域独立文件）
│   └── styles/          # 全局 + 页面级样式
└── src-tauri/           # Rust 后端
    └── src/
        ├── lib.rs       # Tauri 命令注册入口
        ├── paths.rs     # 路径工具（统一数据根目录 data/）
        ├── agent/       # 智能体（session 会话 CRUD、tool 工具层）
        └── api/         # API 实现（camera / model(llm|yolo) / file / DB）
docs/                    # 统一文档中心（见 docs/README.md）
data/                    # 运行时数据根目录（config.json、sessions.db、photos/、models/）
tests/YOLO-test/         # 独立 YOLO 集成测试 crate
design/                  # 设计稿参考（已 gitignore）
```

## 文档

详细文档见 [`docs/README.md`](docs/README.md)（文档中心索引）。工程规范、架构说明与数据模型详见 [`AGENTS.md`](AGENTS.md)。

## 数据模型

统一数据根目录：`data/`。4 张表（`sessions.db`）：

| 表 | 说明 |
|---|---|
| `sessions` | 会话元数据 |
| `messages` | 消息内容（含 thinking、tool_calls、tool_call_id） |
| `photos` | 照片记录（含 batch_label、detections JSON） |
| `phenotypes` | 表型数据（按 class_name 聚合） |

完整字段与数据流说明见 [`AGENTS.md`](AGENTS.md#数据存储)。
