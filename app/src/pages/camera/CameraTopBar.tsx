import { useNavigate } from "react-router-dom";
import { X, Zap, ZapOff, Timer, Settings } from "lucide-react";
import { useCameraStore } from "../../store";

interface CameraTopBarProps {
  onToggleSettings: () => void;
}

export default function CameraTopBar({ onToggleSettings }: CameraTopBarProps) {
  const { flash, toggleFlash } = useCameraStore();
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between px-6 py-4">
      <button
        onClick={() => navigate(-1)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
      >
        <X size={18} />
      </button>
      <div className="flex items-center gap-4">
        <button
          onClick={toggleFlash}
          className={`flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/30 ${
            flash === "on" ? "bg-[#FBBF24]/30 text-[#FBBF24]" : "bg-white/20 text-white"
          }`}
        >
          {flash === "off" ? <ZapOff size={18} /> : <Zap size={18} />}
        </button>
        <button
          onClick={onToggleSettings}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
        >
          <Timer size={18} />
        </button>
        <button
          onClick={onToggleSettings}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
        >
          <Settings size={18} />
        </button>
      </div>
    </div>
  );
}
