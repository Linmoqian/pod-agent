import { useEffect } from "react";
import { useChatStore } from "../../store/appStore";
import ChatSidebar from "./ChatSidebar";
import ChatTopBar from "./ChatTopBar";
import ChatMessageList from "./ChatMessageList";
import ChatInput from "./ChatInput";

const tableData = [
  ["Pi-ta", "92%", "45%", "+47%"],
  ["Pi-b", "78%", "32%", "+46%"],
  ["Xa21", "85%", "61%", "+24%"],
  ["Pib", "67%", "28%", "+39%"],
];

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

        <ChatInput />
      </div>
    </div>
  );
}
