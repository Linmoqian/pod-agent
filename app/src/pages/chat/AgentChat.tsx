import { useEffect } from "react";
import { useChatStore } from "../../store";
import ChatSidebar from "./ChatSidebar";
import ChatTopBar from "./ChatTopBar";
import ChatMessageList from "./ChatMessageList";
import ChatInput from "./ChatInput";
import ChatPreview from "./ChatPreview";

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

          {viewMode === "split" && <ChatPreview />}
        </div>

        <ChatInput />
      </div>
    </div>
  );
}
