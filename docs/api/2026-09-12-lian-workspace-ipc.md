# lian 工作区 IPC

本文是 `lian@育种台` M2 工作区 command 与事件契约的 Markdown 权威说明，读者是前端、Rust 与验收测试维护者。实现依据为 `app/src-tauri/src/commands/`、`app/src-tauri/src/domain/mod.rs` 与 `app/src/services/workspace.ts`。

## 接口元信息

| 项目 | 内容 |
| --- | --- |
| 接口标识 | `ensure_active_conversation`、`get_conversation_context`、`send_message`、`cancel_agent`、`set_provider_key`、`clear_provider_key`、`get_provider_key_preview`、`refresh_provider_models`、`submit_agent_intent`、`confirm_task_plan`、`cancel_workflow`、`get_workspace_snapshot`、`get_artifact_detail`、`list_workspace_files`、`read_workspace_file`、`set_terminal_access`、`run_terminal_command` |
| 用途 | 从工作区文件查看、开发人员终端、数据导入到混合模型 Artifact 血缘的唯一前端业务边界 |
| 调用方 | `app/src/features/workspace/` |
| 提供方 | Tauri Rust 后端 |
| 稳定性 | V1 实验性 |
| 引入版本 | `0.1.0` |
| 维护方 | `app/src-tauri/src/commands/` |
| 接口类型 | Tauri command 与事件 |
| 调用方式 | JSON IPC；耗时 I/O command 为异步 |
| 权限或认证 | 仅主窗口 `main`；文件选择另需 `dialog:allow-open` |
| Content-Type | 不适用 |

科研事实链固定为 `Project → Dataset → DatasetVersion → ResearchSchema → Material/Trait/Environment → TaskPlanRun → Execution → Artifact → Lineage`。SQLite 中的 Rust 服务是唯一事实权威。

## M2 稳定命令

| 分组 | command | 关键请求与响应 |
| --- | --- | --- |
| Project | `list_projects`、`create_project`、`update_project`、`archive_project`、`get_project_overview` | 项目列表、状态与 Rust 计算的事实摘要 |
| 语义导入 | `inspect_data_sources`、`confirm_data_import` | 检查返回 `importSessionId` 与身份建议；确认接收 `request.importSessionId/registrations[]` |
| 语义查询 | `list_materials`、`get_material_context`、`list_traits`、`list_environments` | 只返回当前 Project 内实体；材料上下文包含关联 DatasetVersion |
| 科研计划 | `submit_research_intent`、`start_task_plan_run` | 输入为 `EntityRef[]`；每次启动创建新的 TaskPlanRun 与 Execution |
| Agent 对话 | `send_message`、`cancel_agent` | 通过 Rust 管理的单一常驻 Node Agent 进程；请求级 `requestId`，事件增量与终态分离 |
| 模型与凭据 | `set_provider_key`、`clear_provider_key`、`get_provider_key_preview`、`migrate_provider_keys`、`refresh_provider_models` | API Key 只进 macOS Keychain；前端只持有非敏感模型引用、尾部预览与模型 ID 目录 |
| 执行与血缘 | `get_execution_detail`、`get_lineage_subgraph` | 血缘方向为 `upstream/downstream/both`，深度自动限制为 1–5，默认 2 |
| 工作区文件 | `list_workspace_files`、`read_workspace_file` | 只读列出受限文件树，并读取 Markdown/代码文件供中央预览；相对路径由 Rust 校验 |
| 开发人员终端 | `set_terminal_access`、`run_terminal_command` | 仅开发人员模式 UI 使用；同步 Rust 进程内开关后，在工程根目录执行一次性命令，输出不持久化 |

`ensure_draft_project`、`register_datasets`、`submit_agent_intent`、`confirm_task_plan` 与 `get_artifact_detail` 在 M2 保留为兼容入口，内部仍落入同一 SQLite 权威层；M3 前不得删除。

## 请求

| command | 调用方式 | 请求字段 | 约束与说明 |
| --- | --- | --- | --- |
| `ensure_draft_project` | 同步 | `nameHint?: string` | 返回最近的草稿项目；仅当名称仍为默认值时使用非空提示重命名 |
| `inspect_data_sources` | 异步 | `projectId: string`、`paths: string[]` | 路径来自原生文件选择或拖放；非空；递归最多 100 个普通文件；忽略符号链接与隐藏目录项 |
| `register_datasets` | 异步 | `projectId: string`、`registrations[].sourceId: string`、`registrations[].mapping: object` | `sourceId` 必须来自检查结果；mapping 以 Sheet 名为键，字段角色为 `material/environment/replicate/block/trait/value/unit` |
| `send_message` | 异步 | `conversationId: string`、`content: string`、`requestId: string`、`model?: AgentModelRequest` | 先写入用户消息，再进入常驻 Agent；无数据也可讨论；成功后写入助手消息 |
| `cancel_agent` | 同步 | `requestId: string` | 发送 abort；返回只表示取消请求已转发，最终以 `send_message` 的结构化错误为准 |
| `submit_agent_intent` | 异步 | `projectId: string`、`intent?: string`、`datasetIds: string[]`、`conversationId?: string`、`requestId: string`、`model?: AgentModelRequest` | V1 使用首个 Dataset；目标性状必须来自 Dataset Schema；模型/Agent 错误不再静默降级 |
| `submit_research_intent` | 异步 | `projectId: string`、`intent?: string`、`inputs: EntityRef[]`、`conversationId?: string`、`requestId: string`、`model?: AgentModelRequest` | 解析 Dataset/ DatasetVersion 后复用 `submit_agent_intent` |
| `set_provider_key` | 异步 | `providerId: string`、`key: string` | 写入 macOS Keychain；完整密钥不返回 |
| `clear_provider_key` | 异步 | `providerId: string` | 从 macOS Keychain 删除凭据 |
| `get_provider_key_preview` | 异步 | `providerId: string` | 返回 `string|null`，仅为 `••••` 加密钥尾 4 位 |
| `migrate_provider_keys` | 异步 | `credentials: Record<string,string>` | 首次启动迁移旧 localStorage；全部写入成功后才清除旧值，失败保留旧值 |
| `refresh_provider_models` | 异步 | `providerId: string`、`baseUrl: string` | Rust 从 Keychain 取密钥请求 `/models`，只返回去重后的模型 ID |
| `confirm_task_plan` | 异步 | `planId: string` | 只接受 `awaiting_confirmation/failed/cancelled/interrupted`；质量状态为 `fail` 时拒绝 |
| `cancel_workflow` | 同步 | `runId: string` | 仅运行中的进程内任务可取消 |
| `get_workspace_snapshot` | 同步 | `projectId: string` | 返回该项目的持久化工作区快照 |
| `get_artifact_detail` | 同步 | `artifactId: string` | 返回 Artifact、直接上游、来源 Dataset 与同一 WorkflowRun 的 ToolRun |
| `list_workspace_files` | 同步 | 无 | 仅返回工作区内非隐藏目录项，最多 4 层递归、500 个条目；节点包含 `relativePath` |
| `read_workspace_file` | 同步 | `relativePath: string` | 仅允许工作区内、文件树可达的 Markdown/代码文件；单文件最多 1 MiB |
| `set_terminal_access` | 同步 | `enabled: boolean` | 仅更新当前应用进程内的终端访问开关，不写入数据库 |
| `run_terminal_command` | 异步 | `request.command: string` | Rust 进程内开关必须已启用；命令最多 16 KiB；固定在当前工程根目录执行，stdout/stderr 各最多返回 256 KiB |

`AgentModelRequest` 的结构固定为：

```ts
type AgentModelRequest = {
  providerId: string;
  modelId: string;
  customProvider?: { baseUrl: string };
};
```

发行版未选择模型时返回 `MODEL_REQUIRED`；仅开发态允许由 `agent/.env` 提供默认模型。

所有时间字段均为 UTC RFC 3339 字符串。ID 为不透明字符串，调用方不得解析或自行生成业务含义。

## 响应

成功时直接返回下表对象，不包裹额外 `data` 字段。

| command | 响应 | 必定返回 | 说明 |
| --- | --- | --- | --- |
| `ensure_draft_project` | `Project` | 是 | `id/name/status/createdAt/updatedAt` |
| `inspect_data_sources` | `ImportInspection` | 是 | `projectId/importSessionId/candidates[]`；不支持格式以 `supported=false` 返回，不伪装 Dataset |
| `register_datasets` | `Dataset[]` | 是 | 每个 Dataset 包含 Schema、来源校验和、质量状态与版本 |
| `submit_agent_intent` | `TaskPlan` | 是 | 状态初始为 `awaiting_confirmation`；包含 Trait、模型规格、步骤、风险与预期 Artifact |
| `send_message` | `WorkspaceSnapshot` | 是 | SQLite 已写入本轮 user/assistant 消息；Agent 增量通过 `lian-agent-event` 发送 |
| `cancel_agent` | `null` | 是 | 只表示取消请求已转发 |
| `get_provider_key_preview` | `string|null` | 是 | 不返回完整 API Key |
| `refresh_provider_models` | `string[]` | 是 | 只返回非敏感模型 ID，不返回 Provider 响应原文 |
| `confirm_task_plan` | `WorkflowRun` | 是 | command 在工作流终态后返回；成功为 `succeeded`，失败通过结构化错误返回 |
| `cancel_workflow` | `null` | 是 | 只表示取消标记已设置，不表示子进程已经退出 |
| `get_workspace_snapshot` | `WorkspaceSnapshot` | 是 | 兼容字段外增加 `overview/schemas/materials/traits/environments/taskPlanRuns/executions` |
| `get_artifact_detail` | `ArtifactDetail` | 是 | `artifact/upstream/dataset/toolRuns` |
| `list_workspace_files` | `WorkspaceFileNode` | 是 | 根节点与子节点包含 `name/relativePath/directory/children`；不返回文件内容 |
| `read_workspace_file` | `WorkspaceFilePreview` | 是 | 返回 `name/relativePath/kind/language/content`；`kind` 为 `markdown` 或 `code` |
| `set_terminal_access` | `null` | 是 | 只表示当前进程内开关已更新 |
| `run_terminal_command` | `TerminalRunResult` | 是 | 返回 `stdout/stderr/status/success/truncated/durationMs/cwd`；只表示本次命令结果，不创建持久化运行记录 |

`Dataset.source` 对前端仅暴露 `sourceId/name/format/checksum/size`，不暴露受管目录绝对路径。`Artifact.files[]` 包含 `name/contentType/size/checksum`；除受限的 `read_workspace_file` 预览外，文件内容不通过 IPC 直接返回。

错误统一序列化为：

```json
{
  "code": "DATA_QUALITY_BLOCKED",
  "message": "数据质量检查未通过；请先处理主键、标识或单位冲突",
  "retryable": false
}
```

## 错误码

| 代码 | 含义 | 可重试 | 处理建议 |
| --- | --- | --- | --- |
| `PROJECT_NOT_FOUND`、`DATASET_NOT_FOUND`、`ARTIFACT_NOT_FOUND`、`TASK_PLAN_NOT_FOUND` | 对象不存在 | 否 | 刷新工作区并停止使用旧 ID |
| `EMPTY_IMPORT`、`SOURCE_NOT_FOUND`、`IMPORT_TOO_LARGE` | 导入输入为空、不存在或超过 100 个文件 | 否 | 重新选择有效范围 |
| `PYTHON_RUNTIME_UNAVAILABLE` | 未找到 `lian-breeding-v1` 解释器 | 满足条件 | 安装环境或设置有效的 `LIAN_PYTHON_BIN` 后重试 |
| `WORKER_FAILED`、`WORKER_PROTOCOL_ERROR` | Adapter/统计进程失败或响应非法 | 视原因 | 保留运行记录，检查 ToolRun 日志与环境 |
| `DATASET_REQUIRED`、`TRAIT_NOT_FOUND`、`DATASET_PROJECT_MISMATCH` | 计划输入不合法 | 否 | 重新选择当前项目内的数值 Trait Dataset |
| `DATA_QUALITY_BLOCKED` | 主键、标识或单位等 QC 为 `fail` | 否 | 先修正来源映射或登记新版本 |
| `ANALYSIS_NOT_IDENTIFIABLE` | 重复不足、奇异、不收敛或统计输出不成立 | 否 | 补充数据或改做描述分析 |
| `TASK_PLAN_STATE_INVALID` | 当前计划状态不可开始 | 否 | 刷新后按最新状态操作 |
| `WORKFLOW_NOT_RUNNING`、`WORKFLOW_CANCELLED` | 任务已结束或已经取消 | 否 | 查询快照确认终态 |
| `WORKSPACE_UNAVAILABLE`、`WORKSPACE_FILE_UNAVAILABLE` | 工作区或目标文件不可读取 | 是 | 刷新文件树后重试 |
| `WORKSPACE_FILE_UNSUPPORTED`、`WORKSPACE_FILE_TOO_LARGE` | 文件类型不支持或超过 1 MiB | 否 | 使用 Markdown/代码文件，或缩小文件后重试 |
| `TERMINAL_LOCKED` | 当前未选择开发人员模式 | 否 | 在设置 → 工作模式中选择“开发人员” |
| `TERMINAL_COMMAND_REQUIRED`、`TERMINAL_COMMAND_TOO_LARGE` | 命令为空或超过 16 KiB | 否 | 输入有效命令并控制命令长度 |
| `TERMINAL_EXEC_FAILED`、`TERMINAL_TASK_FAILED` | Shell 启动或终端任务边界失败 | 是 | 检查本机 Shell 与当前工程环境后重试 |
| `AGENT_UNAVAILABLE`、`AGENT_TIMEOUT`、`AGENT_PROCESS_EXITED`、`AGENT_PROCESS_RESTARTED`、`AGENT_PROTOCOL_ERROR`、`AGENT_OUTPUT_INVALID`、`MODEL_REQUEST_FAILED` | 常驻 Agent 不可用、超时、崩溃恢复、输出非法或模型请求失败 | 是 | 检查模型配置；下一次请求会自动重启 Agent 并从 SQLite 恢复最近历史 |
| `AGENT_BUSY`、`AGENT_ABORTED` | 同一会话已有请求，或请求已取消 | 否/是 | 同一会话串行；点击停止后等待 `settled=aborted` |
| `MODEL_REQUIRED`、`MODEL_INVALID`、`MODEL_NOT_FOUND`、`PROVIDER_URL_INVALID` | 未选择模型、模型引用/地址无效或模型目录不存在 | 否 | 在模型设置中选择或刷新有效模型 |
| `KEYCHAIN_UNAVAILABLE`、`KEYCHAIN_READ_FAILED`、`KEYCHAIN_WRITE_FAILED`、`KEYCHAIN_DELETE_FAILED`、`KEYCHAIN_MIGRATION_FAILED` | macOS Keychain 访问、写入、清除或迁移失败 | 是 | 不删除迁移源值，检查系统 Keychain 权限后重试 |
| `MODEL_REFRESH_FAILED`、`MODEL_CATALOG_INVALID`、`MODEL_CATALOG_EMPTY` | 自定义 Provider 模型目录不可用或格式不合法 | 视原因 | 检查 Base URL、服务状态与 `/models` 响应 |
| `DB_BUSY`、`WORKFLOW_BUSY`、`IMPORT_TASK_FAILED`、`REGISTER_TASK_FAILED`、`WORKFLOW_TASK_FAILED` | 暂时性执行边界失败 | 是 | 刷新状态后有限次数重试 |
| `ARTIFACT_PATH_INVALID`、`UNKNOWN_TOOL` | 工具返回越界路径或工具未注册 | 否 | 拒绝结果并检查工具版本，不绕过安全门 |

## 权限与安全

- 前端仅调用上述 command；不得直接访问 SQLite、受管目录或 Python/Node 进程。
- Rust 校验项目 ID 与统计输出文件名，所有科研元数据、状态和校验和以 SQLite 为准。
- 工作区预览只接受非空相对路径；拒绝绝对路径、`..`、符号链接、隐藏/受管目录与超出文件树深度的路径，单文件读取上限为 1 MiB。
- `run_terminal_command` 只接受开发人员模式请求，固定使用本机 Shell 在工程根目录执行；命令和输出均不写入 SQLite，stdout/stderr 单次各最多返回 256 KiB。
- 原始文件复制到 `projects/{projectId}/sources`，按 SHA-256 去重并设为只读；不覆盖仓库旧 `data/`。
- Pi 不注册文件、Shell 或数据库工具；终端仅由开发人员 UI 直接调用。Python 只读取 Rust 写入配置中的受管输入并输出到指定运行目录。
- 错误和事件不得包含密钥、模型提供商凭证或受管文件绝对路径。Keychain 完整密钥只在前端输入 → Rust → Agent 进程内存链路中短暂存在。
- API Key 不写入 SQLite、Redux、localStorage、事件、日志或错误消息；旧 `pod-agent.credentials` 仅在首次启动成功迁移后清除，迁移失败保持原值。

## 行为约束

- 副作用：检查阶段登记并复制不可变源文件；登记阶段生成 Dataset 与 `quality.report`；确认阶段写入运行记录并生成分析 Artifact。
- 幂等性：原始源文件按项目与 SHA-256 去重；重复确认已运行中的计划会被状态门拒绝。失败、取消或中断后的重试创建新的 WorkflowRun 并保留旧记录。
- 超时与取消：常驻 Agent 计划请求超时为 45 秒、讨论请求超时为 15 分钟；超时先发送 abort，5 秒内未 settled 才重启子进程。Python 分析轮询取消标记，取消时终止子进程。V1 尚未为 Python 设置独立墙钟超时。
- 并发、限流与重试：单次检查最多 100 个文件；SQLite 连接以互斥锁串行访问；调用方不得无限重试。
- 终端：一次只提交一个命令；当前实现是一次性命令执行，不提供持久化 Shell 会话或 PTY 交互。
- 重启：应用启动时把仍为 `running` 的 WorkflowRun、TaskPlanRun、Execution 与 TaskPlan 标记为 `interrupted`；前端重新调用 `get_workspace_snapshot` 恢复状态，不依赖内存事件重放。
- 日志：stdout/stderr 在子进程运行期间持续排空，各最多保留 10 MiB；Execution 只保存文件描述、校验和与截断标记。
- 输出验证：Rust 仅接受统计输出清单中的单层文件名，计算每个文件及组合 SHA-256 后登记 Artifact。

四类事件均由 Rust 发送、主窗口订阅；事件用于提示刷新，不是持久化真相源。

| 事件 | 触发时机 | 典型 `eventType` |
| --- | --- | --- |
| `lian-import-event` | 检查或登记完成 | `import.inspected`、`dataset.registered` |
| `lian-agent-event` | TaskPlan 已持久化 | `task.plan.created` |
| `lian-agent-event` | Agent 流式回复 | `agent.reply.delta`，载荷含 `requestId/conversationId/kind/delta` |
| `lian-yolo-event` | Agent 工具进度 | 载荷含 `requestId/conversationId/id/status`，检测框仅供本地任务界面消费 |
| `lian-workflow-event` | WorkflowRun 状态变化 | `workflow.started/succeeded/failed/cancelled` |

生命周期事件载荷固定为 `eventId/projectId/taskId?/runId?/timestamp/eventType/payload`。Agent 流事件载荷固定为 `eventType/requestId/conversationId/kind/delta`；YOLO 进度事件固定含 `requestId/conversationId/id/status`。事件可能在窗口未订阅或重启时丢失；调用方收到终态后必须以 `get_conversation_context`/`get_workspace_snapshot` 查询最终状态。

## 调用示例

### 请求示例

```ts
const plan = await invoke("submit_agent_intent", {
  projectId: "9ca4c2b5-4ac3-4efa-9005-e7aa34161c1f",
  intent: "分析株高的多环境 BLUP",
  datasetIds: ["4bf9779f-ed4f-41f3-b9f1-9b73a8a1d6fa"],
  conversationId: "cb5a8c1b-6c8b-40c6-89f1-c1f83c4a9320",
  requestId: crypto.randomUUID(),
  model: { providerId: "openai", modelId: "gpt-4o" },
});
```

自由讨论与停止：

```ts
const requestId = crypto.randomUUID();
const pending = workspaceApi.sendMessage(
  conversationId,
  "如何安排田间重复？",
  requestId,
  { providerId: "openai", modelId: "gpt-4o" },
);
await workspaceApi.cancelAgent(requestId);
await pending; // 取消时返回 AGENT_ABORTED
```

### 响应示例

```json
{
  "id": "c57b4516-8a19-4470-8690-28efbd147b02",
  "projectId": "9ca4c2b5-4ac3-4efa-9005-e7aa34161c1f",
  "datasetId": "4bf9779f-ed4f-41f3-b9f1-9b73a8a1d6fa",
  "title": "株高多环境表型分析",
  "intent": "分析株高的多环境 BLUP",
  "traitId": "plant_height",
  "planner": { "mode": "deterministic_fallback", "model": null },
  "modelSpec": {
    "method": "REML",
    "fixedEffects": ["environment_id"],
    "randomEffects": ["material_id", "material_id:environment_id"]
  },
  "expectedArtifacts": ["model.fit", "breeding.blup", "breeding.gxe", "report.analysis"],
  "status": "awaiting_confirmation",
  "steps": [],
  "createdAt": "2026-09-12T08:00:00Z"
}
```

### 错误示例

```json
{
  "code": "TASK_PLAN_STATE_INVALID",
  "message": "任务计划当前不可启动",
  "retryable": false
}
```

## 兼容性与变更记录

- 兼容性说明：调用方必须容忍对象新增可选字段与 `payload` 新增键，但不得假定未知状态可以执行。
- 废弃计划：无。V1 仍为实验性契约；稳定前的破坏性修改必须同步更新 Rust DTO、TypeScript 类型、本文档与测试。

| 日期 | 版本 | 变更类型 | 内容 | 迁移说明 |
| --- | --- | --- | --- | --- |
| 2026-09-12 | 0.1.0 | 兼容 | 建立 V1 八个 command 与三个生命周期事件契约 | 无 |
| 2026-09-12 | 0.2.0 | 兼容扩展 | 增加 M2 科研语义、导入确认、Execution、Lineage 与 Project API | V1 command 保留至 M3 |
| 2026-09-14 | 0.3.0 | 领域重构 | 对话成为交互单元：新增 `ensure_active_conversation` / `get_conversation_context` / `open_project_context` / `new_temporary_conversation` / `send_message` / `promote_conversation`；`submit_agent_intent` / `submit_research_intent` 增加可选 `conversationId`；Agent 进程新增 `discuss` 请求（返回 Markdown 回复，上下文明确声明当前无数据） | DB v3：messages 改挂 conversations，历史 Project 消息自动迁入「研究对话」会话；升级前自动备份 `pre-v3-*` |
| 2026-09-16 | 0.4.0 | 兼容扩展 | 开发人员模式增加 `run_terminal_command`，提供受 IPC 门控的一次性本机命令执行面板 | 不影响 Agent 工具、SQLite 与既有工作流 |
| 2026-09-16 | 0.5.0 | 协议升级 | Agent 升级为 v2 LF-JSONL 常驻单进程；增加 `requestId`、`accepted/result/settled`、abort、会话恢复、模型请求引用与 Keychain 凭据边界；macOS 发行资源包含 Node.js v24.21.0 与 Agent bundle | 不修改 SQLite schema；旧凭据首次启动迁移到 macOS Keychain |
