import { useChatStore, useFileManagerStore } from "../../store";
import { FileText, FileSpreadsheet, Folder, X } from "lucide-react";

export default function ChatPreview() {
  const { previewFileId, setPreviewFile } = useChatStore();
  const { files } = useFileManagerStore();

  const file = files.find((f) => f.id === previewFileId);

  if (!file) {
    // 默认数据视图
    return <DataPreview />;
  }

  const Icon = file.type === "文件夹" ? Folder : file.icon === "file-spreadsheet" ? FileSpreadsheet : FileText;

  return (
    <div className="w-[480px] flex-shrink-0 border-l border-[#E5E7EB] bg-[#FAFAFA]">
      <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-3">
        <span className="text-[13px] font-medium text-[#374151]">文件预览</span>
        <button
          onClick={() => setPreviewFile(null)}
          className="rounded-md p-1 text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#374151]"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4">
        {/* 文件图标 + 名称 */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm">
            <Icon size={24} style={{ color: file.color }} />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[#111827]">{file.name}</p>
            <p className="text-[12px] text-[#9CA3AF]">{file.type}</p>
          </div>
        </div>

        {/* 文件信息 */}
        <div className="rounded-xl border border-[#E5E7EB] bg-white">
          <div className="border-b border-[#F3F4F6] px-4 py-3">
            <p className="text-[11px] font-medium text-[#9CA3AF]">类型</p>
            <p className="text-[13px] text-[#374151]">{file.type}</p>
          </div>
          <div className="border-b border-[#F3F4F6] px-4 py-3">
            <p className="text-[11px] font-medium text-[#9CA3AF]">大小</p>
            <p className="text-[13px] text-[#374151]">{file.size}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] font-medium text-[#9CA3AF]">修改时间</p>
            <p className="text-[13px] text-[#374151]">{file.time}</p>
          </div>
        </div>

        {/* 预览区域 */}
        <div className="mt-4 rounded-xl border border-[#E5E7EB] bg-white p-6">
          <div className="flex h-[200px] items-center justify-center">
            <div className="text-center">
              <Icon size={48} style={{ color: file.color }} className="mx-auto mb-3 opacity-40" />
              <p className="text-[13px] text-[#9CA3AF]">
                {file.type === "文件夹" ? "文件夹内容加载中..." : `${file.type} 文件预览`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 默认数据预览（无文件选中时） */
function DataPreview() {
  const tableData = [
    ["Pi-ta", "92%", "45%", "+47%"],
    ["Pi-b", "78%", "32%", "+46%"],
    ["Xa21", "85%", "61%", "+24%"],
    ["Pib", "67%", "28%", "+39%"],
  ];

  return (
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
  );
}
