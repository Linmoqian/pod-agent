import Toggle from "./Toggle";

interface SettingsRowProps {
  label: string;
  value?: string;
  toggle?: boolean;
  onToggle?: () => void;
  action?: string;
  onAction?: () => void;
  suffix?: "chevron-right";
  onClick?: () => void;
}

export default function SettingsRow({
  label,
  value,
  toggle,
  onToggle,
  action,
  onAction,
  suffix,
  onClick,
}: SettingsRowProps) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3"
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <span className="text-[13px] text-ink">{label}</span>
      {toggle !== undefined ? (
        <Toggle checked={toggle} onChange={() => onToggle?.()} />
      ) : action ? (
        <span
          className="cursor-pointer text-[13px] text-danger hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onAction?.();
          }}
        >
          {action}
        </span>
      ) : value ? (
        <div className="flex items-center gap-1.5 rounded-md bg-canvas px-2.5 py-1">
          <span className="text-[12px] text-ink">{value}</span>
          {suffix === "chevron-right" && (
            <svg
              className="h-3 w-3 text-ink-muted-48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          )}
        </div>
      ) : null}
    </div>
  );
}
