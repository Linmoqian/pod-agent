import { useState, useRef, useEffect } from "react";
import { useChatStore } from "../store/appStore";
import { Plus, Search, MessageSquare, Paperclip, FileSpreadsheet, Sparkles, ChevronDown, Columns2, ArrowUp, Mic, Camera, Code, Image, X } from "lucide-react";

const conversations = [
  { id: "1", title: "水稻基因组分析方案", time: "刚刚", active: true },
  { id: "2", title: "小麦产量预测模型", time: "2小时前" },
  { id: "3", title: "玉米育种数据清洗", time: "昨天" },
  { id: "4", title: "大豆抗性基因筛选", time: "3天前" },
  { id: "5", title: "育种报告生成", time: "上周" },
];

const chartData = [120, 90, 140, 100, 130, 80, 110];
const legendItems = [
  { label: "Pi-ta", color: "#3B82F6" },
  { label: "Pi-b", color: "#60A5FA" },
  { label: "Xa21", color: "#93C5FD" },
];

const tableData = [
  ["Pi-ta", "92%", "45%", "+47%"],
  ["Pi-b", "78%", "32%", "+46%"],
  ["Xa21", "85%", "61%", "+24%"],
  ["Pib", "67%", "28%", "+39%"],
];

export default function AgentChat() {
  const {
    messages,
    inputValue,
    sidebarOpen,
    viewMode,
    selectedModel,
    attachedFiles,
    addMessage,
    setInputValue,
    toggleSidebar,
    setViewMode,
    setSelectedModel,
    detachFile,
  } = useChatStore();

  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [activeConversation, setActiveConversation] = useState("1");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (inputValue.trim()) {
      addMessage("user", inputValue);
      setInputValue("");
      setTimeout(() => {
        addMessage("assistant", "正在分析您的请求，请稍候...");
      }, 1000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full bg-white">
      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="w-[280px] flex-shrink-0 border-r border-[#E5E7EB] bg-[#F9FAFB] p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[15px] font-semibold text-[#111827]">Pod Agent</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  addMessage("user", "");
                  setActiveConversation(String(Date.now()));
                }}
                className="flex items-center gap-1.5 rounded-lg bg-[#111827] px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#374151]"
              >
                <Plus size={14} />
                新对话
              </button>
              <button
                onClick={toggleSidebar}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]"
              >
                <Columns2 size={14} />
              </button>
            </div>
          </div>

          <div className="mb-3 flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2">
            <Search size={14} className="text-[#9CA3AF]" />
            <input
              type="text"
              placeholder="搜索对话..."
              className="w-full bg-transparent text-[13px] text-[#374151] outline-none placeholder:text-[#9CA3AF]"
            />
          </div>

          <p className="mb-2 text-[11px] font-medium tracking-wide text-[#9CA3AF]">最近对话</p>
          <div className="mb-3 flex flex-col gap-0.5">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setActiveConversation(conv.id)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  activeConversation === conv.id ? "bg-[#EFF6FF]" : "hover:bg-black/5"
                }`}
              >
                <MessageSquare
                  size={16}
                  className={activeConversation === conv.id ? "text-[#3B82F6]" : "text-[#6B7280]"}
                />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[13px] ${activeConversation === conv.id ? "font-medium text-[#1E40AF]" : "text-[#374151]"}`}>
                    {conv.title}
                  </p>
                  <p className="text-[11px] text-[#9CA3AF]">{conv.time}</p>
                </div>
              </button>
            ))}
          </div>

          <p className="mb-2 text-[11px] font-medium tracking-wide text-[#9CA3AF]">已选文件</p>
          <div className="flex flex-col gap-2">
            {attachedFiles.map((f) => (
              <div key={f} className="flex items-center gap-2.5 rounded-lg bg-[#F3F4F6] px-3 py-2">
                <FileSpreadsheet size={16} className="text-[#22C55E]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-[#374151]">{f}</p>
                </div>
                <button
                  onClick={() => detachFile(f)}
                  className="text-[#9CA3AF] hover:text-[#EF4444]"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* Main Area */}
      <div className="flex flex-1 flex-col">
        {/* Top Bar */}
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-6 py-3">
          {!sidebarOpen && (
            <button
              onClick={toggleSidebar}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]"
            >
              <Columns2 size={16} />
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              className="flex items-center gap-2 rounded-lg bg-[#F3F4F6] px-3 py-1.5 hover:bg-[#E5E7EB]"
            >
              <Sparkles size={16} className="text-[#8B5CF6]" />
              <span className="text-[13px] font-medium text-[#374151]">{selectedModel}</span>
              <ChevronDown size={14} className="text-[#6B7280]" />
            </button>
            {showModelDropdown && (
              <div className="absolute left-0 top-full z-10 mt-1 w-48 rounded-lg border border-[#E5E7EB] bg-white py-1 shadow-lg">
                {["Pod Agent Pro", "Pod Agent Standard", "Pod Agent Lite"].map((model) => (
                  <button
                    key={model}
                    onClick={() => {
                      setSelectedModel(model);
                      setShowModelDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-[13px] hover:bg-[#F3F4F6] ${
                      selectedModel === model ? "font-medium text-[#8B5CF6]" : "text-[#374151]"
                    }`}
                  >
                    {model}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-[#F3F4F6] p-0.5">
            <button
              onClick={() => setViewMode("split")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] ${
                viewMode === "split" ? "bg-white font-medium text-[#374151] shadow-sm" : "text-[#6B7280]"
              }`}
            >
              <Columns2 size={14} />
              协作
            </button>
            <button
              onClick={() => setViewMode("chat")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] ${
                viewMode === "chat" ? "bg-white font-medium text-[#374151] shadow-sm" : "text-[#6B7280]"
              }`}
            >
              <MessageSquare size={14} />
              对话
            </button>
          </div>
        </div>

        {/* Split Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Chat Panel */}
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
                  {msg.role === "assistant" && msg.id === "2" && (
                    <div className="mt-4 space-y-4">
                      {/* Chart Card */}
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
                      {/* Code Block */}
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

          {/* Preview Panel */}
          {viewMode === "split" && (
            <div className="w-[480px] flex-shrink-0 border-l border-[#E5E7EB] bg-[#FAFAFA]">
              <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-3">
                <span className="text-[13px] font-medium text-[#374151]">文件预览</span>
                <div className="flex gap-1">
                  <button className="rounded-md bg-white px-2.5 py-1 text-[12px] font-medium text-[#374151]">数据</button>
                  <button className="rounded-md px-2.5 py-1 text-[12px] text-[#6B7280] hover:bg-white/50">可视化</button>
                </div>
              </div>
              <div className="p-4">
                <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#F9FAFB] text-[12px] font-medium text-[#6B7280]">
                        <th className="px-3.5 py-2.5 text-left">基因</th>
                        <th className="px-3.5 py-2.5 text-left">品种A</th>
                        <th className="px-3.5 py-2.5 text-left">品种B</th>
                        <th className="px-3.5 py-2.5 text-left">差异</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.map((row, i) => (
                        <tr key={i} className="border-t border-[#F3F4F6] text-[12px]">
                          {row.map((cell, j) => (
                            <td key={j} className={`px-3.5 py-2.5 ${j === 3 ? "font-medium text-[#22C55E]" : "text-[#374151]"}`}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-[#E5E7EB] px-8 py-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] p-3">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="描述你的育种分析需求..."
                className="mb-2 w-full resize-none bg-transparent text-[14px] text-[#374151] outline-none placeholder:text-[#9CA3AF]"
                rows={1}
              />
              <div className="flex items-center gap-3">
                <Paperclip size={18} className="cursor-pointer text-[#6B7280] hover:text-[#374151]" />
                <Mic size={18} className="cursor-pointer text-[#6B7280] hover:text-[#374151]" />
                <Camera size={18} className="cursor-pointer text-[#6B7280] hover:text-[#374151]" />
                <FileSpreadsheet size={18} className="cursor-pointer text-[#6B7280] hover:text-[#374151]" />
                <Code size={18} className="cursor-pointer text-[#6B7280] hover:text-[#374151]" />
                <Image size={18} className="cursor-pointer text-[#6B7280] hover:text-[#374151]" />
              </div>
            </div>
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#3B82F6] text-white hover:bg-[#2563EB] disabled:opacity-50"
            >
              <ArrowUp size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
