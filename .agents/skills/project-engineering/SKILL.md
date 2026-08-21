---
name: project-engineering
description: 按 Pod Agent 工程规范安全实施代码、配置、文档、依赖或构建改动。用于保护已有工作区、控制改动范围、选择验证方式并按规范提交。
---

# Pod Agent 项目工程规范

## 读取顺序

1. 完整读取 [项目主规范](../../../AGENTS.md)。
2. 根据任务读取必要专题规范：
   - Rust/Tauri：[rust.md](../../../docs/development/rust.md)
   - React 前端：[frontend.md](../../../docs/development/frontend.md)
   - Python 原型：[python.md](../../../docs/development/python.md)
   - 验证：[verification.md](../../../docs/development/verification.md)
   - Git：[git-workflow.md](../../../docs/development/git-workflow.md)
   - 写作：[writing.md](../../../docs/development/writing.md)
3. 查找当前目录中的更具体规范；更具体的项目事实优先。

## 实施流程

1. 说明目标、成功标准、修改范围、不修改范围与验证方式。
2. 检查 `git status --short --branch` 和相关差异，保护已有未提交改动。
3. 复用现有架构、依赖与测试，以最小改动完成任务。
4. 行为、接口、数据、构建或 UI 改动执行对应验证；纯文档检查差异、链接和示例。
5. 精准暂存本次文件并检查暂存差异；只有形成独立且验证通过的语义单元时才本地提交。
6. 未经工程师明确确认不得推送、发布、部署或操作 PR。

## 决策边界

涉及不可逆操作、重要数据迁移、公开接口或持久化格式变化、重大依赖、发布部署、敏感信息，或无法保护已有改动时，暂停并询问工程师。局部、可逆且能由现有测试验证的实现细节可声明假设后继续。

## 最终汇报

说明改动、实际验证、提交状态、未覆盖范围与风险。没有运行测试、没有提交或验证失败时必须明确说明。
