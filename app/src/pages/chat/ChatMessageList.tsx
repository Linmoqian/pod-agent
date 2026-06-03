import { useRef, useEffect } from "react";
import { useChatStore } from "../../store";
import { MessageSquare } from "lucide-react";

const chartData = [120, 90, 140, 100, 130, 80, 110];
const legendItems = [
  { label: "Pi-ta", color: "#3B82F6" },
  { label: "Pi-b", color: "#60A5FA" },
  { label: "Xa21", color: "#93C5FD" },
];

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
            <p className="text-[14px] leading-relaxed text-[#374151]">{msg.content}</p>
            {msg.role === "assistant" && (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
                  <p className="mb-3 text-[13px] font-semibold text-[#111827]">抗性基因分布热力图</p>
                  <div className="mb-3 flex h-[160px] items-end gap-1 px-2">
                    {chartData.map((h, i) => (
                      <div
                        key={i}
                        className="w-10 rounded-t-[4px]"
                        style={{ height: h, backgroundColor: ["#3B82F6", "#60A5FA", "#93C5FD"][i % 3] }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-4">
                    {legendItems.map((item) => (
                      <div key={item.label} className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-[11px] text-[#6B7280]">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg bg-[#1E293B] p-4 font-mono text-[12px]">
                  <p className="text-[#94A3B8]"># 基因差异分析结果</p>
                  <p className="text-[#E2E8F0]">品种间差异显著 (p &lt; 0.001)</p>
                  <p className="text-[#22C55E]">抗性基因频率: 品种A (78%) &gt; 品种B (45%)</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
