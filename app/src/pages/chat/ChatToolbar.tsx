import { Paperclip, FileSpreadsheet, Mic, Camera, Code, Image } from "lucide-react";

const tools = [
  { icon: Paperclip, label: "附件" },
  { icon: Mic, label: "语音" },
  { icon: Camera, label: "拍照" },
  { icon: FileSpreadsheet, label: "文件" },
  { icon: Code, label: "代码" },
  { icon: Image, label: "图片" },
];

export default function ChatToolbar() {
  return (
    <div className="flex items-center gap-3">
      {tools.map(({ icon: Icon, label }) => (
        <button key={label} title={label} className="cursor-pointer text-[#6B7280] hover:text-[#374151]">
          <Icon size={18} />
        </button>
      ))}
    </div>
  );
}
