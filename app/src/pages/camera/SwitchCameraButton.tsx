import { RefreshCw } from "lucide-react";

interface SwitchCameraButtonProps {
  onClick: () => void;
}

export default function SwitchCameraButton({ onClick }: SwitchCameraButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
    >
      <RefreshCw size={20} />
    </button>
  );
}
