# 流式对话感优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除 chat 流式生成的内容跳动、滚动改为底部跟随且上滚不打扰、assistant 流式时显示打字光标。

**Architecture:** 三件实事基于「temp 消息流式结束时内容已完整且与后端渲染一致（assistant(tool_calls) 载体被过滤、tool 渲染为气泡）」的判断——移除 sendMessage 结尾的 loadMessages 重载消除跳动；ChatMessageList 加 isAtBottom 跟随 + 上滚不打扰；MessageBubble 加 isStreaming 打字光标。

**Tech Stack:** React 19 + TypeScript + Zustand + Tailwind CSS 4 + lucide-react。

## Global Constraints

- 前端命令在 `app/` 下：`npx tsc --noEmit`
- **前端无单测框架**——不写 TDD 测试步骤；每个 task 用 `npx tsc --noEmit` 类型检查验证，端到端手动验收集中在 Task 4
- 不引入新依赖（用现有 zustand/tailwind/lucide-react）
- 提交 Conventional Commits + 中文，禁止任何 AI 生成字样；仅本地提交，不推送
- 遵循现有组件风格（MessageBubble/ChatMessageList 的 className 与 #色板）
- git 命令用 `git -C /Volumes/base/project/pod-agent`（shell cwd 可能漂移）
- 当前分支：`feat/chat-streaming-ux`

## File Structure

| 文件 | 职责 | 改动任务 |
|---|---|---|
| `app/src/store/chatStore.ts` | sendMessage 移除 loadMessages 重载 | Task 1 |
| `app/src/pages/chat/ChatMessageList.tsx` | 智能滚动 + streamingMsgId 计算 + 传 isStreaming | Task 2, 3 |
| `app/src/pages/chat/MessageBubble.tsx` | isStreaming prop + 打字光标 | Task 3 |

---

## Task 1: 消除重载跳动（chatStore.ts）

**Files:**
- Modify: `app/src/store/chatStore.ts`（sendMessage 函数末尾，约 :227-238）

**Interfaces:**
- 无新接口；仅移除一行 `loadMessages` 调用。

**背景:** `sendMessage` 流式拼接 temp 消息后，原代码 `await get().loadMessages(sessionId)` 用后端持久化消息整体替换 temp，造成跳动。temp 内容已通过 `llm-chunk`/`llm-thinking`/`llm-tool-call`/`llm-tool-result` 事件增量拼接完整，且与后端渲染一致（`assistant(tool_calls)` 载体被 `ChatMessageList` 过滤为 null），无需重载。切会话/重启时的 `loadMessages`（在 `setActiveSession` 里）保留——那是用户预期的全量切换。

- [ ] **Step 1: 移除 loadMessages 调用**

定位 `chatStore.ts` 的 `sendMessage` 函数，`await invoke("send_llm_message", ...)` 之后的块。当前代码：

```typescript
      await invoke("send_llm_message", { sessionId, content });
      unlistenChunk();
      unlistenThinking();
      unlistenToolCall();
      unlistenToolResult();

      await get().loadMessages(sessionId);
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, updated_at: new Date().toISOString() } : s
        ),
      }));
```

移除 `await get().loadMessages(sessionId);` 这一行（保留其余），结果：

```typescript
      await invoke("send_llm_message", { sessionId, content });
      unlistenChunk();
      unlistenThinking();
      unlistenToolCall();
      unlistenToolResult();

      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, updated_at: new Date().toISOString() } : s
        ),
      }));
```

- [ ] **Step 2: 类型检查**

Run: `cd app && npx tsc --noEmit`
Expected: 0 errors。

- [ ] **Step 3: 提交**

```bash
git -C /Volumes/base/project/pod-agent add app/src/store/chatStore.ts
git -C /Volumes/base/project/pod-agent commit -m "fix(chat): 移除流式结束后的 loadMessages 重载消除跳动"
```

---

## Task 2: 智能滚动（ChatMessageList.tsx）

**Files:**
- Modify: `app/src/pages/chat/ChatMessageList.tsx`（整体替换）

**Interfaces:**
- Consumes: `useChatStore` 的 `messages` / `activeSessionId` / `sending`
- Produces: 智能滚动行为（底部跟随 + 上滚不打扰）

**背景:** 当前 `ChatMessageList` 每次 `messages` 变化都 `messagesEndRef.scrollIntoView({behavior:"smooth"})`——流式时每 chunk 触发（smooth 动画叠加抖动），且用户上滚会被拉回底部。

- [ ] **Step 1: 重写 ChatMessageList 为智能滚动**

替换 `app/src/pages/chat/ChatMessageList.tsx` 整个文件为：

```tsx
import { useRef, useEffect, useState } from "react";
import { useChatStore } from "../../store";
import { MessageSquare } from "lucide-react";
import MessageBubble from "./MessageBubble";
import ToolCallBubble from "./ToolCallBubble";

/// 距底部小于此阈值视为「在底部」，触发自动跟随
const SCROLL_BOTTOM_THRESHOLD = 80;

export default function ChatMessageList() {
  const messages = useChatStore((s) => s.messages);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const sending = useChatStore((s) => s.sending);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // 切换会话 → 重置为底部跟随
  useEffect(() => {
    setIsAtBottom(true);
  }, [activeSessionId]);

  // 消息变化 → 仅在底部时跟随；sending 时 instant 避免抖动，非 sending smooth
  useEffect(() => {
    if (!isAtBottom) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: sending ? "auto" : "smooth",
    });
  }, [messages, isAtBottom, sending]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(distanceFromBottom < SCROLL_BOTTOM_THRESHOLD);
  };

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <MessageSquare size={48} className="mx-auto mb-4 text-[#D1D5DB]" />
          <p className="mb-2 text-[14px] font-medium text-[#374151]">开始新的对话</p>
          <p className="text-[13px] text-[#9CA3AF]">输入你的育种分析需求</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex flex-1 flex-col overflow-auto p-6">
      {messages.map((msg) => {
        // 工具调用载体消息（assistant 且无 content）不单独渲染
        if (msg.role === "assistant" && !msg.content && msg.tool_calls) {
          return null;
        }
        if (msg.role === "tool") {
          return <ToolCallBubble key={msg.id} msg={msg} />;
        }
        return <MessageBubble key={msg.id} msg={msg} />;
      })}
    </div>
  );
}
```

注意：移除了原 `messagesEndRef`，改用 `containerRef` + `scrollTop/scrollHeight`；滚动容器（`overflow-auto` 的 div）挂 `ref` + `onScroll`。

- [ ] **Step 2: 类型检查**

Run: `cd app && npx tsc --noEmit`
Expected: 0 errors。

- [ ] **Step 3: 提交**

```bash
git -C /Volumes/base/project/pod-agent add app/src/pages/chat/ChatMessageList.tsx
git -C /Volumes/base/project/pod-agent commit -m "feat(chat): 智能滚动，上滚不打扰、底部跟随"
```

---

## Task 3: 打字光标（ChatMessageList.tsx + MessageBubble.tsx）

**Files:**
- Modify: `app/src/pages/chat/ChatMessageList.tsx`（在 Task 2 基础上加 `streamingMsgId` + 传 `isStreaming`）
- Modify: `app/src/pages/chat/MessageBubble.tsx`（加 `isStreaming` prop + 光标）

**Interfaces:**
- Consumes: `useChatStore` 的 `sending`（Task 2 已取）
- Produces: `MessageBubble` 接收 `isStreaming?: boolean` prop

- [ ] **Step 1: ChatMessageList 加 streamingMsgId 并传 isStreaming**

替换 `app/src/pages/chat/ChatMessageList.tsx` 整个文件为（Task 3 终态 = Task 2 + streamingMsgId）：

```tsx
import { useRef, useEffect, useState } from "react";
import { useChatStore } from "../../store";
import { MessageSquare } from "lucide-react";
import MessageBubble from "./MessageBubble";
import ToolCallBubble from "./ToolCallBubble";

const SCROLL_BOTTOM_THRESHOLD = 80;

export default function ChatMessageList() {
  const messages = useChatStore((s) => s.messages);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const sending = useChatStore((s) => s.sending);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // 流式目标：sending 时最后一条 assistant 消息 id；非 sending 时为 null（无光标）
  const streamingMsgId = sending
    ? [...messages].reverse().find((m) => m.role === "assistant")?.id ?? null
    : null;

  useEffect(() => {
    setIsAtBottom(true);
  }, [activeSessionId]);

  useEffect(() => {
    if (!isAtBottom) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: sending ? "auto" : "smooth",
    });
  }, [messages, isAtBottom, sending]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(distanceFromBottom < SCROLL_BOTTOM_THRESHOLD);
  };

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <MessageSquare size={48} className="mx-auto mb-4 text-[#D1D5DB]" />
          <p className="mb-2 text-[14px] font-medium text-[#374151]">开始新的对话</p>
          <p className="text-[13px] text-[#9CA3AF]">输入你的育种分析需求</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex flex-1 flex-col overflow-auto p-6">
      {messages.map((msg) => {
        if (msg.role === "assistant" && !msg.content && msg.tool_calls) {
          return null;
        }
        if (msg.role === "tool") {
          return <ToolCallBubble key={msg.id} msg={msg} />;
        }
        return <MessageBubble key={msg.id} msg={msg} isStreaming={msg.id === streamingMsgId} />;
      })}
    </div>
  );
}
```

改动点（相对 Task 2）：加 `streamingMsgId` 计算；`MessageBubble` 渲染加 `isStreaming={msg.id === streamingMsgId}`。

- [ ] **Step 2: MessageBubble 加 isStreaming prop + 打字光标**

替换 `app/src/pages/chat/MessageBubble.tsx` 整个文件为：

```tsx
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ChatMessage } from "../../store";
import MarkdownContent from "../../components/MarkdownContent";

function ThinkingBlock({ thinking }: { thinking: string }) {
  const [expanded, setExpanded] = useState(true);
  if (!thinking) return null;

  return (
    <div className="mt-2 rounded-lg border border-[#E5E7EB] bg-[#F8F9FA]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-[#6B7280] hover:text-[#374151]"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        思考过程
      </button>
      {expanded && (
        <div className="border-t border-[#E5E7EB] px-3 py-2 text-[13px] leading-relaxed text-[#6B7280] whitespace-pre-wrap">
          {thinking}
        </div>
      )}
    </div>
  );
}

export default function MessageBubble({
  msg,
  isStreaming = false,
}: {
  msg: ChatMessage;
  isStreaming?: boolean;
}) {
  return (
    <div className="mb-6 flex gap-3">
      <div
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-medium text-white ${
          msg.role === "user" ? "bg-[#3B82F6]" : "bg-[#8B5CF6]"
        }`}
      >
        {msg.role === "user" ? "U" : "AI"}
      </div>
      <div className="min-w-0 flex-1">
        {msg.role === "assistant" && msg.thinking && (
          <ThinkingBlock thinking={msg.thinking} />
        )}
        {msg.content && (
          msg.role === "assistant" ? (
            <div>
              <MarkdownContent content={msg.content} className="text-[14px] leading-relaxed text-[#374151]" />
              {isStreaming && (
                <span className="ml-0.5 inline-block animate-pulse text-[#8B5CF6]">▋</span>
              )}
            </div>
          ) : (
            <p className="text-[14px] leading-relaxed text-[#374151]">{msg.content}</p>
          )
        )}
        {msg.role === "assistant" && !msg.content && msg.thinking && (
          <p className="text-[13px] text-[#9CA3AF] animate-pulse">思考中...</p>
        )}
      </div>
    </div>
  );
}
```

改动点（相对原文件）：函数签名加 `isStreaming = false` prop；assistant 的 content 渲染从直接 `<MarkdownContent>` 改为包一层 `<div>`，末尾追加光标 `<span className="ml-0.5 inline-block animate-pulse text-[#8B5CF6]">▋</span>`（仅 `isStreaming` 时）。

- [ ] **Step 3: 类型检查**

Run: `cd app && npx tsc --noEmit`
Expected: 0 errors。

- [ ] **Step 4: 提交**

```bash
git -C /Volumes/base/project/pod-agent add app/src/pages/chat/ChatMessageList.tsx app/src/pages/chat/MessageBubble.tsx
git -C /Volumes/base/project/pod-agent commit -m "feat(chat): assistant 流式生成时显示打字光标"
```

---

## Task 4: 端到端验收（手动，无代码改动）

**前提:** `npm run tauri dev` 能启动；`data/config.json` 已配 LLM（如 DeepSeek-V3）；有至少一个含照片/表型数据的会话（用于触发 query_phenotypes）。

- [ ] **Step 1: 启动 + 普通流式**

Run: `cd app && npm run tauri dev`
发一条消息（如「你好」）。
Expected: assistant 回复流式生成，文末有紫色闪烁光标 ▋；生成结束（sending 转 false）光标消失；整个过程内容无跳动闪烁。

- [ ] **Step 2: 上滚不打扰**

流式生成中，手动上滚查看历史消息。
Expected: 视图停留在历史位置，不被拉回底部；新内容在下方持续生成但不强制滚动。

- [ ] **Step 3: 底部跟随**

滚回底部（距底 < 80px）。
Expected: 恢复自动跟随，新内容把视图推到底。

- [ ] **Step 4: tool calling 单轮闭环**

发「今年豆荚拍了多少？」（触发 query_phenotypes）。
Expected: 工具气泡出现 → 最终回答流式；整个过程无 loadMessages 重载导致的跳动；工具气泡与最终回答顺序正确；回答末尾有光标。

- [ ] **Step 5: 切换会话**

切换到另一个会话再切回。
Expected: 切回时视图在底部（isAtBottom 重置）；历史消息正常显示，无跳动。

- [ ] **Step 6: 全量类型检查**

Run: `cd app && npx tsc --noEmit`
Expected: 0 errors。

- [ ] **Step 7: 收尾提交（如有修复）**

若验收发现 bug 并修复，按语义提交；无修复则跳过。

---

## Spec Coverage

| 设计文档章节 | 覆盖任务 |
|---|---|
| §3.1 消除重载跳动（移除 loadMessages） | Task 1 |
| §3.2 智能滚动（isAtBottom + 阈值 80 + 切会话重置 + sending instant） | Task 2 |
| §3.3 打字光标（streamingMsgId + isStreaming prop + ▋ animate-pulse） | Task 3 |
| §4 验证（tsc + 手动 5 点） | Task 4 |
| §5 不做（markdown 平滑/thinking 折叠/工具展开） | 无任务（YAGNI） |
