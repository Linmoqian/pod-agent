# 文档中心

Pod Agent 项目文档统一入口。工程规范与架构说明见根目录 `AGENTS.md`。

## 目录导航

| 目录 / 文件 | 内容 |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | 工程规范总纲：项目概述、命令、目录结构、架构要点、模型加载、数据存储、会话数据流（唯一规范源） |
| `implemented/` | 已实施功能的实施文档归档（每个功能一个目录：`design.md` 设计 + `plan.md` 实施计划，均已完成） |
| `discussions/` | 圆桌讨论历史决策归档（`discussions.md` 合并版 + `raw/` 原始过程 json） |
| `superpowers/` | **进行中/未来**功能的实施文档工作区（`{plans,specs}/`，当前为空） |
| `design/`（仓库根） | 设计稿参考（已 gitignore） |

## 已实施功能（archived）

见 `implemented/`，每个功能目录含设计稿与实施计划，对应代码均已落地在 `main` 分支。

| 日期 | 功能 | 目录 |
|---|---|---|
| 2026-06-19 | LLM Tool Calling 接通（单轮闭环） | `implemented/2026-06-19-llm-tool-calling/` |
| 2026-06-21 | Agent 引用照片能力 | `implemented/2026-06-21-agent-refer-photos/` |
| 2026-06-21 | 端到端表型导出闭环 | `implemented/2026-06-21-phenotype-export/` |
| 2026-06-21 | 流式对话感优化 | `implemented/2026-06-21-chat-streaming-ux/` |

## 历史决策讨论

见 `discussions/`：
- `discussions.md` — 两次圆桌讨论合并版（2026-06-19 讨论 agent 方向、2026-06-20 综合讨论项目下一步）
- `raw/` — 两次讨论的原始过程 json 备份
