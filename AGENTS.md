本项目中不要生产构建和测试

## 项目认知

`pod-agent` 是面向大豆育种的本地桌面科研助手。主应用位于 `app/`，采用 Tauri 2、React 19、TypeScript、Rust 与 Python 的组合；`sensor-app/`、`hardware/`、`3D-app/` 为相对独立的传感器、硬件建模和实验性三维表型方向。

### 当前主链路

1. 对话是交互单元：首次启动创建临时会话，不自动创建 Project。
2. Project 是可选的持续科研容器；导入数据前，临时会话必须先提升为 Project。
3. Rust/Tauri IPC 是前端访问科研数据和工作流的唯一正式边界，SQLite 是业务事实来源。
4. 导入支持 CSV、TSV、TXT、XLSX；Rust 将来源文件复制至受管目录并按 SHA-256 去重，Python Worker 负责字段推断、规范化和质量检查。
5. 有 Dataset 后，Agent 生成受控 TaskPlan；用户确认后才由 Rust 启动 Python 多环境混合模型/BLUP 工作流，并持久化 Execution、Artifact 与 Lineage。
6. 无数据时可自由讨论、解释方法和规划实验，但不得声称拥有数据或虚构分析结论。

### 关键目录与职责

- `app/src/features/workspace/`：当前研究对话、数据导入、计划与 Artifact 交互主实现。
- `app/src/services/workspace.ts`：前端 Tauri IPC 客户端契约。
- `app/src-tauri/src/commands/`：IPC 输入校验与调用边界。
- `app/src-tauri/src/services/db.rs`：SQLite schema、迁移与持久化，当前 schema 为 v4。
- `app/src-tauri/src/services/planner.rs` 与 `app/agent/`：受控 Node/Pi Agent 的 JSONL 通信；计划与讨论均不得获得通用文件、Shell 或数据库能力。
- `app/python/worker.py`：受控表格处理、质量检查和统计分析；运行时需要 `lian-breeding-v1` Conda 环境或有效的 `LIAN_PYTHON_BIN`。
- `app/src-tauri/src/services/yolo.rs` 与 `app/agent/tools/yolo.ts`：本地鉴权 ONNX/Python YOLO 计数；只向 Agent 返回摘要，当前 COCO 权重不支持豆荚计数。

### 维护注意事项

- 修改对话功能时，以 `workspace`、`commands/conversation.rs` 和 `services/workspace.ts` 为准。`app/src/features/chat/` 保留早期 HTTP 流式方案，当前主路由未使用。
- `docs/api/2026-09-12-lian-workspace-ipc.md` 含有早期 V1/V2 描述；发生接口修改时，以命令注册、Rust DTO/领域模型和前端类型为事实依据，并同步更新文档。
- 数据库升级会创建 `pre-v*-<timestamp>` 备份；涉及 schema 或消息/项目归属迁移时，必须评估兼容性与恢复路径。
- 原始数据、模型凭据、受管目录绝对路径、图片路径、检测框和执行日志不得泄露给不应访问的一侧；不得绕过 Rust 的路径、质量、状态和 Artifact 输出校验。
