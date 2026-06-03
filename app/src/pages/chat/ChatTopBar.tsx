import { useState } from "react";
import { useChatStore } from "../../store";
import { MessageSquare, Sparkles, ChevronDown, Columns2 } from "lucide-react";

export default function ChatTopBar() {
  const {
    selectedModel,
    viewMode,
    sidebarOpen,
    toggleSidebar,
    setViewMode,
    setSelectedModel,
  } = useChatStore();

  const [showModelDropdown, setShowModelDropdown] = useState(false);

  return (
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
  );
}
