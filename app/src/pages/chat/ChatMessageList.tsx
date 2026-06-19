import { useRef, useEffect } from "react";
import { useChatStore } from "../../store";
import { MessageSquare } from "lucide-react";
import MessageBubble from "./MessageBubble";
import ToolCallBubble from "./ToolCallBubble";

export default function ChatMessageList() {
  const { messages } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    <div className="flex flex-1 flex-col overflow-auto p-6">
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
      <div ref={messagesEndRef} />
    </div>
  );
}
