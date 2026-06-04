import { MessageSquare, Trash2 } from "lucide-react";

interface SessionItemProps {
  title: string;
  updatedAt: string;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export default function SessionItem({ title, updatedAt, isActive, onSelect, onDelete }: SessionItemProps) {
  return (
    <div
      className={`group flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors ${
        isActive ? "bg-[#EFF6FF]" : "hover:bg-black/5"
      }`}
    >
      <button
        onClick={onSelect}
        className="flex flex-1 items-center gap-2.5 text-left"
      >
        <MessageSquare
          size={16}
          className={isActive ? "text-[#3B82F6]" : "text-[#6B7280]"}
        />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[13px] ${isActive ? "font-medium text-[#1E40AF]" : "text-[#374151]"}`}>
            {title}
          </p>
          <p className="text-[11px] text-[#9CA3AF]">{updatedAt}</p>
        </div>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="hidden h-6 w-6 items-center justify-center rounded text-[#9CA3AF] hover:bg-[#E5E7EB] hover:text-[#EF4444] group-hover:flex"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
