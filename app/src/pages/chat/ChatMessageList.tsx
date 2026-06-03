import { useRef, useEffect, useState } from "react";
import { useChatStore } from "../../store";
import { MessageSquare, ChevronDown, ChevronRight } from "lucide-react";

function ThinkingBlock({ thinking }: { thinking: string }) {
  const [expanded, setExpanded] = useState(false);
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
      {messages.map((msg) => (
        <div key={msg.id} className="mb-6 flex gap-3">
          <div
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-medium text-white ${
              msg.role === "user" ? "bg-[#3B82F6]" : "bg-[#8B5CF6]"
            }`}
          >
            {msg.role === "user" ? "U" : "AI"}
          </div>
          <div className="flex-1">
            {msg.role === "assistant" && msg.thinking && (
              <ThinkingBlock thinking={msg.thinking} />
            )}
            {msg.content && (
              <p className="text-[14px] leading-relaxed text-[#374151]">{msg.content}</p>
            )}
            {msg.role === "assistant" && !msg.content && msg.thinking && (
              <p className="text-[13px] text-[#9CA3AF] animate-pulse">思考中...</p>
            )}
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
