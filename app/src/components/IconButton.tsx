import { LucideIcon } from "lucide-react";

interface IconButtonProps {
  icon: LucideIcon;
  size?: number;
  onClick?: () => void;
  className?: string;
  active?: boolean;
}

export default function IconButton({
  icon: Icon,
  size = 18,
  onClick,
  className = "",
  active = false,
}: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
        active
          ? "bg-[#3B82F6] text-white"
          : "bg-white/20 text-white hover:bg-white/30"
      } ${className}`}
    >
      <Icon size={size} />
    </button>
  );
}
