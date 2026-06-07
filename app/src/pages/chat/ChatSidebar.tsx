import { useState } from "react";
import { useChatStore, useFileManagerStore } from "../../store";
import { Plus, Search, FileSpreadsheet, FileText, Folder, Columns2, X } from "lucide-react";
import SessionItem from "./SessionItem";

export default function ChatSidebar() {
  const {
    sessions,
    activeSessionId,
    attachedFiles,
    createConversation,
    setActiveSession,
    deleteConversation,
    toggleSidebar,
    detachFile,
    attachFile,
  } = useChatStore();

  const { files } = useFileManagerStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [showFilePicker, setShowFilePicker] = useState(false);

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const availableFiles = files.filter((f) => !attachedFiles.includes(f.name));

  const handleAddFile = (name: string) => {
    attachFile(name);
    if (availableFiles.length <= 1) {
      setShowFilePicker(false);
    }
  };

  return (
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
        {filteredSessions.map((session) => (
          <SessionItem
            key={session.id}
            title={session.title}
            updatedAt={session.updated_at}
            isActive={activeSessionId === session.id}
            onSelect={() => setActiveSession(session.id)}
            onDelete={() => deleteConversation(session.id)}
          />
        ))}
      </div>

      <p className="mb-2 flex items-center justify-between text-[11px] font-medium tracking-wide text-[#9CA3AF]">
        <span>已选文件</span>
        {availableFiles.length > 0 && (
          <button
            onClick={() => setShowFilePicker(!showFilePicker)}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[#6B7280] hover:bg-[#E5E7EB]"
          >
            <Plus size={12} />
            添加
          </button>
        )}
      </p>

      {/* 文件选择列表 */}
      {showFilePicker && (
        <div className="mb-2 flex flex-col gap-0.5 rounded-lg border border-[#E5E7EB] bg-white p-1.5">
          {availableFiles.map((f) => {
            const Icon = f.type === "文件夹" ? Folder : f.icon === "file-spreadsheet" ? FileSpreadsheet : FileText;
            return (
              <button
                key={f.id}
                onClick={() => handleAddFile(f.name)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[#F3F4F6]"
              >
                <Icon size={14} style={{ color: f.color }} />
                <span className="truncate text-[12px] text-[#374151]">{f.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 已选文件列表 */}
      <div className="flex flex-col gap-2">
        {attachedFiles.map((f: string) => (
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
  );
}
