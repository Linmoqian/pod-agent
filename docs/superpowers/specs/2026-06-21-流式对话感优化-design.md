# 流式对话感优化 设计

> **状态**：已通过 brainstorming 对齐，待 writing-plans 细化
> **日期**：2026-06-21
> **范围**：chat 流式生成过程的体验（跳动 / 滚动 / 打字反馈）。不涉及消息样式、thinking 呈现、工具气泡（其他方向）

## 1. 目标

提升 chat 流式生成的「对话感」：消除内容跳动、滚动不打扰用户、生成时有打字反馈。让用户感觉在和智能体实时对话，而不是等一段静态文字被替换。

## 2. 背景（当前问题）

经代码核实，chat 流式体验有三个具体问题：

1. **重载跳动（最大）**：`chatStore.sendMessage` 流式增量拼接 temp 消息（`temp-assistant-*` / `temp-tool-*`），但 `invoke` 返回后调用 `await get().loadMessages(sessionId)`（`chatStore.ts:233`）整体重载——用后端持久化消息替换 temp，造成内容/顺序跳动。
2. **强制滚动打扰**：`ChatMessageList.tsx:11-13` 的 `useEffect(() => scrollIntoView({behavior:"smooth"}), [messages])` 在**每次** messages 变化时强制 smooth 滚底——流式时每 chunk 都触发（smooth 动画叠加抖动），且用户上滚查看历史会被强行拉回底部。
3. **无打字光标**：流式生成时，除 thinking 的「思考中…」脉冲外，content 流式拼接无任何「正在生成」的视觉反馈。

**核心洞察**：流式结束时 temp 消息的 `content`/`thinking` 已通过增量拼接完整，且与后端持久化消息**渲染一致**——`assistant(tool_calls)` 载体被 `ChatMessageList` 过滤为 null、tool 渲染为 `ToolCallBubble`，所以视觉上 `[user, tool气泡, assistant气泡]` 完全对应。因此**移除 `loadMessages` 重载即可消除跳动**，是最小且核心的修复。`send_llm_message` 在后端流结束（emit `llm-done`）后才 resolve，故 invoke 返回时 temp 内容已完整。

## 3. 设计

### 3.1 消除重载跳动（`app/src/store/chatStore.ts` sendMessage）

- **移除** `:233` 的 `await get().loadMessages(sessionId)`
- 保留 invoke 返回后的 `unlistenChunk/unlistenThinking/unlistenToolCall/unlistenToolResult()` 与 `sessions.updated_at` 更新
- `catch` 分支保持（失败时删 temp 消息）
- **理由**：temp 内容已完整且与后端渲染一致；切会话/重启时的 `loadMessages` 全量替换是用户预期行为（切换场景，跳动可接受）

### 3.2 智能滚动（`app/src/pages/chat/ChatMessageList.tsx`）

- 滚动容器加 `ref`（指向 `overflow-auto` 的 div）+ `isAtBottom` state
- `onScroll` handler：`scrollHeight - scrollTop - clientHeight < 80` → `isAtBottom=true`，否则 false
- `useEffect([messages, isAtBottom])`：**仅当 `isAtBottom` 时**滚到底——用户上滚时不打扰，滚回底部时自动恢复跟随
- 滚动行为：`sending=true` 时 `behavior:"auto"`（instant，避免 smooth 动画在每 chunk 叠加抖动）；非 sending 用 `"smooth"`
- `setActiveSession` / `loadMessages`（会话切换）后重置 `isAtBottom=true`，保证新会话默认滚到底

### 3.3 打字光标（`app/src/pages/chat/ChatMessageList.tsx` + `MessageBubble.tsx`）

- `ChatMessageList` 计算 `streamingMsgId`：`useChatStore(s => s.sending)` 为 true 时，等于 `messages` 中最后一条 `role==="assistant"` 消息的 id
- 传 `isStreaming={msg.id === streamingMsgId}` 给对应 `MessageBubble`
- `MessageBubble`：当 `role==="assistant" && isStreaming && content` 非空时，在 content 末尾追加闪烁光标 `<span className="ml-0.5 inline-block animate-pulse">▋</span>`
- 生成结束（`sending` 转 false → `isStreaming` false）光标自动消失

## 4. 验证

前端无单元测试框架，验证 = 类型检查 + 手动：

- `cd app && npx tsc --noEmit`：0 errors
- 手动验收：
  1. 流式生成中无内容跳动（不再有 loadMessages 重载的闪烁）
  2. 上滚查看历史时不被拉回底部
  3. 停留在底部时内容自动跟随到底
  4. assistant 文末有闪烁光标，生成结束消失
  5. tool calling 单轮闭环（query_phenotypes）时无跳动，工具气泡与最终回答顺序正确

## 5. 明确不做（YAGNI / 越界）

- 流式 markdown 平滑（半个代码块/表格渲染抖动）——业界难题，成本高收益不确定
- thinking 默认折叠——属「思考过程呈现」方向（本轮未选）
- 工具气泡默认展开——属「工具调用展示」方向（本轮未选）
- 监听 `llm-done` 做完成信号——invoke 返回即流结束，无需额外事件（YAGNI）

## 6. 约束

- 前端命令在 `app/` 下：`npx tsc --noEmit`
- 不引入新依赖（用现有 lucide-react / tailwind / zustand）
- 提交信息 Conventional Commits + 中文，禁止任何 AI 生成字样；仅本地提交，不推送远程
- 遵循现有组件风格（MessageBubble/ChatMessageList 的 className 与色板）
