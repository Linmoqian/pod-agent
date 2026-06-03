import { ChevronRight } from "lucide-react";

interface BreadcrumbProps {
  items: string[];
  onNavigate?: (index: number) => void;
}

export default function Breadcrumb({ items, onNavigate }: BreadcrumbProps) {
  return (
    <div className="flex items-center gap-1.5 text-[13px]">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight size={14} className="text-[#CBD5E1]" />}
          <span
            className={`cursor-pointer ${
              i === items.length - 1
                ? "text-[#64748B]"
                : "text-[#3B82F6] hover:underline"
            }`}
            onClick={() => onNavigate?.(i)}
          >
            {item}
          </span>
        </span>
      ))}
    </div>
  );
}
