import { useEffect } from "react";
import { useChatStore } from "../../store/appStore";
import ChatSidebar from "./ChatSidebar";
import ChatTopBar from "./ChatTopBar";
import ChatMessageList from "./ChatMessageList";
import ChatInput from "./ChatInput";

export default function AgentChat() {
  const { sidebarOpen, viewMode, loadSessions } = useChatStore();

  useEffect(() => {
    loadSessions();
  }, []);

  return (
    <div className="flex h-full bg-white">
      {sidebarOpen && <ChatSidebar />}

      <div className="flex flex-1 flex-col">
        <ChatTopBar />

        <div className="flex flex-1 overflow-hidden">
          <ChatMessageList />

          {viewMode === "split" && (
            <div className="w-[480px] flex-shrink-0 border-l border-[#E5E7EB] bg-[#FAFAFA]">
              <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-3">
                <span className="text-[13px] font-medium text-[#374151]">文件预览</span>
                <div className="flex gap-1">
                  <button className="rounded-md bg-white px-2.5 py-1 text-[12px] font-medium text-[#374151]">数据</button>
                  <button className="rounded-md px-2.5 py-1 text-[12px] text-[#6B7280] hover:bg-white/50">可视化</button>
                </div>
              </div>
            </div>
          )}
        </div>

        <ChatInput />
      </div>
    </div>
  );
}
