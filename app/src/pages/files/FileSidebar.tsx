import { Trash2, Star, Clock, Database, ImageIcon } from "lucide-react";

const navItems = [
  { label: "全部文件", icon: Database },
  { label: "最近打开", icon: Clock },
  { label: "收藏", icon: Star },
  { label: "回收站", icon: Trash2 },
  { label: "图片管理", icon: ImageIcon },
];

interface FileSidebarProps {
  activeNav: string;
  onNavChange: (label: string) => void;
}

export default function FileSidebar({ activeNav, onNavChange }: FileSidebarProps) {
  return (
    <aside className="w-[240px] border-r border-[#E2E8F0] bg-white p-4">
      <h1 className="mb-4 text-base font-semibold text-[#0F172A]">Pod Agent</h1>
      <p className="mb-2 text-[11px] font-medium tracking-wider text-[#94A3B8]">文件</p>
      <nav className="mb-4 flex flex-col gap-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={() => onNavChange(item.label)}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors ${
                activeNav === item.label ? "bg-[#EFF6FF] font-medium text-[#3B82F6]" : "text-[#475569] hover:bg-gray-50"
              }`}
            >
              <Icon size={16} className={activeNav === item.label ? "text-[#3B82F6]" : "text-[#64748B]"} />
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
  );
}
