import { useState, useEffect } from "react";
import { useChatStore, useFileManagerStore, useCameraStore } from "../../store";
import { Plus, Search, FileSpreadsheet, FileText, Folder, Columns2, Camera } from "lucide-react";
import SessionItem from "./SessionItem";

export default function ChatSidebar() {
  const {
    sessions,
    activeSessionId,
    previewFileId,
    previewPhotoMeta,
    createConversation,
    setActiveSession,
    deleteConversation,
    toggleSidebar,
    setPreviewFile,
    setPreviewPhoto,
  } = useChatStore();

  const { files } = useFileManagerStore();
  const photoList = useCameraStore((s) => s.photoList);
  const loadPhotoList = useCameraStore((s) => s.loadPhotoList);

  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadPhotoList();
  }, []);

  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

      <p className="mb-2 text-[11px] font-medium tracking-wide text-[#9CA3AF]">文件管理</p>
      <div className="mb-3 flex flex-col gap-0.5">
        {files.map((f) => {
          const Icon = f.type === "文件夹" ? Folder : f.icon === "file-spreadsheet" ? FileSpreadsheet : FileText;
          const isActive = previewFileId === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setPreviewFile(isActive ? null : f.id)}
              className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
                isActive ? "bg-[#EFF6FF]" : "hover:bg-[#F3F4F6]"
              }`}
            >
              <Icon size={16} style={{ color: f.color }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-[#374151]">{f.name}</p>
                <p className="text-[10px] text-[#9CA3AF]">{f.size !== "-" ? f.size : f.type}</p>
              </div>
            </button>
          );
        })}
      </div>

      <p className="mb-2 text-[11px] font-medium tracking-wide text-[#9CA3AF]">照片</p>
      <div className="flex flex-col gap-0.5">
        {photoList.length === 0 && (
          <p className="px-2.5 py-2 text-[12px] text-[#9CA3AF]">暂无照片</p>
        )}
        {photoList.map((photo) => {
          const isActive = previewPhotoMeta?.id === photo.id;
          return (
            <button
              key={photo.id}
              onClick={() => setPreviewPhoto(isActive ? null : photo)}
              className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
                isActive ? "bg-[#EFF6FF]" : "hover:bg-[#F3F4F6]"
              }`}
            >
              <Camera size={16} className="text-[#8B5CF6]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-[#374151]">
                  {photo.capturedAt}
                </p>
                <p className="text-[10px] text-[#9CA3AF]">
                  {photo.width}×{photo.height}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
