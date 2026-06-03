import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Icon size={48} className="mb-4 text-[#D1D5DB]" />
      <p className="mb-1 text-[14px] font-medium text-[#374151]">{title}</p>
      {description && <p className="mb-4 text-[13px] text-[#9CA3AF]">{description}</p>}
      {action}
    </div>
  );
}
