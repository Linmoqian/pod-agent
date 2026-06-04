import { RefreshCw } from "lucide-react";
import { useCameraStore } from "../../store";

interface CaptureBarProps {
  onCapture: () => void;
  onSwitchCamera: () => void;
}

export default function CaptureBar({ onCapture, onSwitchCamera }: CaptureBarProps) {
  const { mode, isRecording } = useCameraStore();

  return (
    <div className="flex items-center justify-between bg-black px-12 py-5">
      {/* Gallery Preview */}
      <button className="h-14 w-14 overflow-hidden rounded-xl border-2 border-white/40 bg-[#374151]">
        <div className="h-full w-full bg-gradient-to-br from-green-500/30 to-blue-500/30" />
      </button>

      {/* Capture Button */}
      <button
        onClick={onCapture}
        className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white transition-transform active:scale-95"
      >
        {mode === "video" ? (
          isRecording ? (
            <div className="h-6 w-6 rounded-sm bg-red-500" />
          ) : (
            <div className="h-14 w-14 rounded-full bg-red-500" />
          )
        ) : (
          <div className="h-14 w-14 rounded-full bg-white" />
        )}
      </button>

      {/* Switch Camera */}
      <button
        onClick={onSwitchCamera}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
      >
        <RefreshCw size={22} />
      </button>
    </div>
  );
}
