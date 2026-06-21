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
