# lian 工作区 IPC

本文是 `lian@育种台` V1 工作区 command 与事件契约的 Markdown 权威说明，读者是前端、Rust 与验收测试维护者。实现依据为 `app/src-tauri/src/commands/`、`app/src-tauri/src/domain/mod.rs` 与 `app/src/services/workspace.ts`。

## 接口元信息

| 项目 | 内容 |
| --- | --- |
| 接口标识 | `ensure_draft_project`、`inspect_data_sources`、`register_datasets`、`submit_agent_intent`、`confirm_task_plan`、`cancel_workflow`、`get_workspace_snapshot`、`get_artifact_detail` |
| 用途 | 从数据导入到混合模型 Artifact 血缘的唯一前端业务边界 |
| 调用方 | `app/src/features/workspace/` |
| 提供方 | Tauri Rust 后端 |
| 稳定性 | V1 实验性 |
| 引入版本 | `0.1.0` |
| 维护方 | `app/src-tauri/src/commands/` |
| 接口类型 | Tauri command 与事件 |
| 调用方式 | JSON IPC；耗时 I/O command 为异步 |
| 权限或认证 | 仅主窗口 `main`；文件选择另需 `dialog:allow-open` |
| Content-Type | 不适用 |

三个科研对象固定为 `Project`、`Dataset` 与 `Artifact`。`TaskPlan`、`WorkflowRun`、`ToolRun`、`Message` 仅表示计划、执行和审计状态。

## 请求

| command | 调用方式 | 请求字段 | 约束与说明 |
| --- | --- | --- | --- |
| `ensure_draft_project` | 同步 | `nameHint?: string` | 返回最近的草稿项目；仅当名称仍为默认值时使用非空提示重命名 |
| `inspect_data_sources` | 异步 | `projectId: string`、`paths: string[]` | 路径来自原生文件选择或拖放；非空；递归最多 100 个普通文件；忽略符号链接与隐藏目录项 |
| `register_datasets` | 异步 | `projectId: string`、`registrations[].sourceId: string`、`registrations[].mapping: object` | `sourceId` 必须来自检查结果；mapping 以 Sheet 名为键，字段角色为 `material/environment/replicate/block/trait/value/unit` |
| `submit_agent_intent` | 异步 | `projectId: string`、`intent?: string`、`datasetIds: string[]` | V1 使用首个 Dataset；目标性状必须来自 Dataset Schema；模型计划失败时退回确定性计划器 |
| `confirm_task_plan` | 异步 | `planId: string` | 只接受 `awaiting_confirmation/failed/cancelled/interrupted`；质量状态为 `fail` 时拒绝 |
| `cancel_workflow` | 同步 | `runId: string` | 仅运行中的进程内任务可取消 |
| `get_workspace_snapshot` | 同步 | `projectId: string` | 返回该项目的持久化工作区快照 |
| `get_artifact_detail` | 同步 | `artifactId: string` | 返回 Artifact、直接上游、来源 Dataset 与同一 WorkflowRun 的 ToolRun |

所有时间字段均为 UTC RFC 3339 字符串。ID 为不透明字符串，调用方不得解析或自行生成业务含义。

## 响应

成功时直接返回下表对象，不包裹额外 `data` 字段。

| command | 响应 | 必定返回 | 说明 |
| --- | --- | --- | --- |
| `ensure_draft_project` | `Project` | 是 | `id/name/status/createdAt/updatedAt` |
| `inspect_data_sources` | `ImportInspection` | 是 | `projectId/candidates[]`；不支持格式以 `supported=false` 返回，不伪装 Dataset |
| `register_datasets` | `Dataset[]` | 是 | 每个 Dataset 包含 Schema、来源校验和、质量状态与版本 |
| `submit_agent_intent` | `TaskPlan` | 是 | 状态初始为 `awaiting_confirmation`；包含 Trait、模型规格、步骤、风险与预期 Artifact |
| `confirm_task_plan` | `WorkflowRun` | 是 | command 在工作流终态后返回；成功为 `succeeded`，失败通过结构化错误返回 |
| `cancel_workflow` | `null` | 是 | 只表示取消标记已设置，不表示子进程已经退出 |
| `get_workspace_snapshot` | `WorkspaceSnapshot` | 是 | `project/datasets/artifacts/taskPlans/workflowRuns/messages` |
| `get_artifact_detail` | `ArtifactDetail` | 是 | `artifact/upstream/dataset/toolRuns` |

`Dataset.source` 对前端仅暴露 `sourceId/name/format/checksum/size`，不暴露受管目录绝对路径。`Artifact.files[]` 包含 `name/contentType/size/checksum`；文件内容 V1 不通过 IPC 直接返回。

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
| `AGENT_UNAVAILABLE`、`AGENT_TIMEOUT`、`AGENT_PROTOCOL_ERROR`、`AGENT_OUTPUT_INVALID` | Pi 计划器不可用、超时或输出非法 | 是 | 系统自动使用确定性计划；需要模型计划时检查 sidecar 配置 |
| `DB_BUSY`、`WORKFLOW_BUSY`、`IMPORT_TASK_FAILED`、`REGISTER_TASK_FAILED`、`WORKFLOW_TASK_FAILED` | 暂时性执行边界失败 | 是 | 刷新状态后有限次数重试 |
| `ARTIFACT_PATH_INVALID`、`UNKNOWN_TOOL` | 工具返回越界路径或工具未注册 | 否 | 拒绝结果并检查工具版本，不绕过安全门 |

## 权限与安全

- 前端仅调用上述 command；不得直接访问 SQLite、受管目录或 Python/Node 进程。
- Rust 校验项目 ID 与统计输出文件名，所有科研元数据、状态和校验和以 SQLite 为准。
- 原始文件复制到 `projects/{projectId}/sources`，按 SHA-256 去重并设为只读；不覆盖仓库旧 `data/`。
- Pi 不注册文件、Shell 或数据库工具。Python 只读取 Rust 写入配置中的受管输入并输出到指定运行目录。
- 错误和事件不得包含密钥、模型提供商凭证或受管文件绝对路径。

## 行为约束

- 副作用：检查阶段登记并复制不可变源文件；登记阶段生成 Dataset 与 `quality.report`；确认阶段写入运行记录并生成分析 Artifact。
- 幂等性：原始源文件按项目与 SHA-256 去重；重复确认已运行中的计划会被状态门拒绝。失败、取消或中断后的重试创建新的 WorkflowRun 并保留旧记录。
- 超时与取消：Pi 计划器超时为 45 秒并退回确定性计划；Python 分析轮询取消标记，取消时终止子进程。V1 尚未为 Python 设置独立墙钟超时。
- 并发、限流与重试：单次检查最多 100 个文件；SQLite 连接以互斥锁串行访问；调用方不得无限重试。
- 重启：应用启动时把仍为 `running` 的 WorkflowRun 与 TaskPlan 标记为 `interrupted`；前端重新调用 `get_workspace_snapshot` 恢复状态，不依赖内存事件重放。
- 输出验证：Rust 仅接受统计输出清单中的单层文件名，计算每个文件及组合 SHA-256 后登记 Artifact。

三个事件均由 Rust 发送、主窗口订阅；事件用于提示刷新，不是持久化真相源。

| 事件 | 触发时机 | 典型 `eventType` |
| --- | --- | --- |
| `lian-import-event` | 检查或登记完成 | `import.inspected`、`dataset.registered` |
| `lian-agent-event` | TaskPlan 已持久化 | `task.plan.created` |
| `lian-workflow-event` | WorkflowRun 状态变化 | `workflow.started/succeeded/failed/cancelled` |

事件载荷固定为 `eventId/projectId/taskId?/runId?/timestamp/eventType/payload`。事件可能在窗口未订阅或重启时丢失；调用方收到事件后必须以 `get_workspace_snapshot` 查询最终状态。

## 调用示例

### 请求示例

```ts
const plan = await invoke("submit_agent_intent", {
  projectId: "9ca4c2b5-4ac3-4efa-9005-e7aa34161c1f",
  intent: "分析株高的多环境 BLUP",
  datasetIds: ["4bf9779f-ed4f-41f3-b9f1-9b73a8a1d6fa"],
});
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
