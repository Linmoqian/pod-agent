import { Search } from "lucide-react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: string;
}

export default function SearchInput({
  value,
  onChange,
  placeholder = "搜索...",
  width = "w-[140px]",
}: SearchInputProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-[#F1F5F9] px-3 py-1.5">
      <Search size={14} className="text-[#94A3B8]" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${width} bg-transparent text-[13px] text-[#374151] outline-none placeholder:text-[#94A3B8]`}
      />
    </div>
  );
}
