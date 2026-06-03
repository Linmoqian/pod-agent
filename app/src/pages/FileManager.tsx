import { useState } from "react";
import { useFileManagerStore } from "../store/appStore";
import { Folder, FileText, FileSpreadsheet, Upload, Plus, Trash2, Star, Clock, Database, Grid, List } from "lucide-react";
import { Breadcrumb, SearchInput, Modal } from "../components";

const navItems = [
  { label: "全部文件", icon: Database, active: true },
  { label: "最近打开", icon: Clock },
  { label: "收藏", icon: Star },
  { label: "回收站", icon: Trash2 },
];

export default function FileManager() {
  const {
    files,
    selectedFiles,
    currentPath,
    viewMode,
    searchQuery,
    selectFile,
    selectAll,
    clearSelection,
    navigateTo,
    setViewMode,
    setSearchQuery,
  } = useFileManagerStore();

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      alert(`创建文件夹: ${newFolderName}`);
      setShowCreateModal(false);
      setNewFolderName("");
    }
  };

  const handleDelete = () => {
    if (selectedFiles.length > 0) {
      alert(`删除 ${selectedFiles.length} 个文件`);
      clearSelection();
    }
  };

  return (
    <div className="flex h-full bg-[#F8FAFC]">
      <aside className="w-[240px] border-r border-[#E2E8F0] bg-white p-4">
        <h1 className="mb-4 text-base font-semibold text-[#0F172A]">Pod Agent</h1>
        <p className="mb-2 text-[11px] font-medium tracking-wider text-[#94A3B8]">文件</p>
        <nav className="mb-4 flex flex-col gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors ${
                  item.active ? "bg-[#EFF6FF] font-medium text-[#3B82F6]" : "text-[#475569] hover:bg-gray-50"
                }`}
              >
                <Icon size={16} className={item.active ? "text-[#3B82F6]" : "text-[#64748B]"} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <p className="mb-2 text-[11px] font-medium tracking-wider text-[#94A3B8]">存储</p>
        <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
          <div className="h-full w-[24%] rounded-full bg-[#3B82F6]" />
        </div>
        <p className="text-[12px] text-[#64748B]">已使用 2.4 GB / 10 GB</p>
      </aside>

      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-white px-6 py-3">
          <Breadcrumb items={currentPath} onNavigate={(i) => navigateTo(currentPath.slice(0, i + 1))} />
          <div className="flex items-center gap-2">
            {selectedFiles.length > 0 && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-red-600"
              >
                <Trash2 size={14} />
                删除 ({selectedFiles.length})
              </button>
            )}
            <div className="flex items-center gap-1 rounded-lg border border-[#E2E8F0] p-0.5">
              <button onClick={() => setViewMode("list")} className={`rounded p-1 ${viewMode === "list" ? "bg-[#F1F5F9]" : ""}`}>
                <List size={16} className="text-[#64748B]" />
              </button>
              <button onClick={() => setViewMode("grid")} className={`rounded p-1 ${viewMode === "grid" ? "bg-[#F1F5F9]" : ""}`}>
                <Grid size={16} className="text-[#64748B]" />
              </button>
            </div>
            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="搜索文件..." />
            <button onClick={() => setShowUploadModal(true)} className="flex items-center gap-1.5 rounded-lg bg-[#3B82F6] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#2563EB]">
              <Upload size={14} />
              上传
            </button>
            <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-1.5 rounded-lg bg-[#F1F5F9] px-3 py-1.5 text-[13px] font-medium text-[#475569] hover:bg-[#E2E8F0]">
              <Plus size={14} />
              新建
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[32px_1fr_100px_80px_140px] gap-4 bg-[#F8FAFC] px-6 py-2.5 text-[12px] font-medium text-[#94A3B8]">
          <div className="cursor-pointer" onClick={selectedFiles.length === files.length ? clearSelection : selectAll}>
            <div className={`h-5 w-5 rounded border ${selectedFiles.length === files.length ? "border-[#3B82F6] bg-[#3B82F6]" : "border-[#CBD5E1]"}`} />
          </div>
          <div>名称</div>
          <div>类型</div>
          <div>大小</div>
          <div>修改时间</div>
        </div>

        <div className="flex-1 overflow-auto bg-white">
          {filteredFiles.map((file) => {
            const isSelected = selectedFiles.includes(file.id);
            return (
              <div
                key={file.id}
                className={`grid cursor-pointer grid-cols-[32px_1fr_100px_80px_140px] items-center gap-4 border-b border-[#F1F5F9] px-6 py-2.5 transition-colors ${
                  isSelected ? "bg-[#EFF6FF]" : "hover:bg-[#F8FAFC]"
                }`}
                onClick={() => selectFile(file.id)}
              >
                <div className={`h-5 w-5 rounded border ${isSelected ? "border-[#3B82F6] bg-[#3B82F6]" : "border-[#CBD5E1]"}`} />
                <div className="flex items-center gap-2.5">
                  <FileIcon type={file.icon} color={file.color} />
                  <span className="text-[13px] text-[#1E293B]">{file.name}</span>
                </div>
                <div className="text-[13px] text-[#64748B]">{file.type}</div>
                <div className="text-[13px] text-[#64748B]">{file.size}</div>
                <div className="text-[13px] text-[#94A3B8]">{file.time}</div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-[#E2E8F0] bg-white px-6 py-2.5 text-[12px] text-[#94A3B8]">
          <span>{filteredFiles.length} 个项目</span>
          <span>总大小 4.5 MB</span>
        </div>
      </div>

      <Modal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title="上传文件"
      >
        <div className="flex h-[200px] items-center justify-center rounded-lg border-2 border-dashed border-[#D1D5DB] bg-[#F9FAFB]">
          <div className="text-center">
            <Upload size={32} className="mx-auto mb-2 text-[#9CA3AF]" />
            <p className="text-[13px] text-[#6B7280]">拖拽文件到此处或点击上传</p>
          </div>
        </div>
      </Modal>

      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="新建文件夹"
        footer={
          <>
            <button onClick={() => setShowCreateModal(false)} className="rounded-lg px-4 py-2 text-[13px] text-[#6B7280] hover:bg-[#F3F4F6]">
              取消
            </button>
            <button onClick={handleCreateFolder} className="rounded-lg bg-[#3B82F6] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#2563EB]">
              创建
            </button>
          </>
        }
      >
        <input
          type="text"
          placeholder="输入文件夹名称"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          className="w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-[13px] outline-none focus:border-[#3B82F6]"
          autoFocus
        />
      </Modal>
    </div>
  );
}

function FileIcon({ type, color }: { type: string; color: string }) {
  if (type === "folder") return <Folder size={18} style={{ color }} />;
  if (type === "file-text") return <FileText size={18} style={{ color }} />;
  return <FileSpreadsheet size={18} style={{ color }} />;
}
