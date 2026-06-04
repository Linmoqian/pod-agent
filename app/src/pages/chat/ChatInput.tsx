import { useChatStore } from "../../store";
import { ArrowUp } from "lucide-react";
import ChatToolbar from "./ChatToolbar";

export default function ChatInput() {
  const { inputValue, setInputValue, sending, sendMessage } = useChatStore();

  const handleSend = () => {
    if (inputValue.trim() && !sending) {
      const content = inputValue;
      setInputValue("");
      sendMessage(content);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
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
          <ChatToolbar />
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
  );
}
