import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useChatStore } from "../../store/appStore";
import { Paperclip, FileSpreadsheet, ArrowUp, Mic, Camera, Code, Image } from "lucide-react";

export default function ChatInput() {
  const { activeSessionId, inputValue, setInputValue } = useChatStore();
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (inputValue.trim() && !sending && activeSessionId) {
      const content = inputValue;
      setInputValue("");
      setSending(true);

      // 先添加用户消息到 UI
      const tempUserId = `temp-user-${Date.now()}`;
      const tempAssistantId = `temp-assistant-${Date.now()}`;
      useChatStore.setState((state) => ({
        messages: [
          ...state.messages,
          { id: tempUserId, session_id: activeSessionId, role: "user", content, created_at: new Date().toISOString() },
          { id: tempAssistantId, session_id: activeSessionId, role: "assistant", content: "", created_at: new Date().toISOString() },
        ],
      }));

      try {
        // 监听流式 chunk，实时更新 assistant 消息
        const unlisten = await listen<{ session_id: string; delta: string }>("llm-chunk", (event) => {
          if (event.payload.session_id !== activeSessionId) return;
          useChatStore.setState((state) => ({
            messages: state.messages.map((m) =>
              m.id === tempAssistantId ? { ...m, content: m.content + event.payload.delta } : m
            ),
          }));
        });

        // 调用后端（流式推送中...）
        await invoke("send_llm_message", { sessionId: activeSessionId, content });

        // 流结束后，从数据库重新加载完整消息（替换临时 ID）
        const { loadMessages, loadSessions } = useChatStore.getState();
        await Promise.all([loadMessages(activeSessionId), loadSessions()]);

        unlisten();
      } catch (e) {
        console.error("发送消息失败:", e);
        // 移除临时的空 assistant 消息
        useChatStore.setState((state) => ({
          messages: state.messages.filter((m) => m.id !== tempAssistantId),
        }));
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
  );
}
