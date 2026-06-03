import { useState, useRef, useEffect } from "react";
import { useChatStore } from "../../store/appStore";
import { Plus, Search, MessageSquare, Paperclip, FileSpreadsheet, Sparkles, ChevronDown, Columns2, ArrowUp, Mic, Camera, Code, Image, X, Trash2 } from "lucide-react";

const tableData = [
  ["Pi-ta", "92%", "45%", "+47%"],
  ["Pi-b", "78%", "32%", "+46%"],
  ["Xa21", "85%", "61%", "+24%"],
  ["Pib", "67%", "28%", "+39%"],
];

export default function AgentChat() {
  const {
    sessions,
    activeSessionId,
    messages,
    inputValue,
    sidebarOpen,
    viewMode,
    selectedModel,
    attachedFiles,
    loadSessions,
    createConversation,
    setActiveSession,
    deleteConversation,
    addMessage,
    setInputValue,
    toggleSidebar,
    setViewMode,
    setSelectedModel,
    detachFile,
  } = useChatStore();

  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (inputValue.trim() && !sending) {
      const content = inputValue;
      setInputValue("");
      setSending(true);
      try {
        await addMessage("user", content);
        // TODO: 对接真实 LLM，当前为占位回复
        await addMessage("assistant", "正在分析您的请求，请稍候...");
      } catch (e) {
        console.error("发送消息失败:", e);
      } finally {
        setSending(false);
      }
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
                onClick={createConversation}
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-[13px] text-[#374151] outline-none placeholder:text-[#9CA3AF]"
            />
          </div>

          <p className="mb-2 text-[11px] font-medium tracking-wide text-[#9CA3AF]">最近对话</p>
          <div className="mb-3 flex flex-col gap-0.5">
            {filteredSessions.map((session) => {
              const isActive = activeSessionId === session.id;
              return (
                <div
                  key={session.id}
                  className={`group flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors ${
                    isActive ? "bg-[#EFF6FF]" : "hover:bg-black/5"
                  }`}
                >
                  <button
                    onClick={() => setActiveSession(session.id)}
                    className="flex flex-1 items-center gap-2.5 text-left"
                  >
                    <MessageSquare
                      size={16}
                      className={isActive ? "text-[#3B82F6]" : "text-[#6B7280]"}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[13px] ${isActive ? "font-medium text-[#1E40AF]" : "text-[#374151]"}`}>
                        {session.title}
                      </p>
                      <p className="text-[11px] text-[#9CA3AF]">{session.updated_at}</p>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(session.id);
                    }}
                    className="hidden h-6 w-6 items-center justify-center rounded text-[#9CA3AF] hover:bg-[#E5E7EB] hover:text-[#EF4444] group-hover:flex"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
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
            {messages.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center">
                  <MessageSquare size={48} className="mx-auto mb-4 text-[#D1D5DB]" />
                  <p className="mb-2 text-[14px] font-medium text-[#374151]">开始新的对话</p>
                  <p className="text-[13px] text-[#9CA3AF]">输入你的育种分析需求</p>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
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
                  </div>
                </div>
              ))
            )}
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
              disabled={!inputValue.trim() || sending}
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
