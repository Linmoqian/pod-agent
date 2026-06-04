import { RefreshCw } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useCameraStore } from "../../store";

interface CaptureBarProps {
  onCapture: () => void;
  onSwitchCamera: () => void;
}

export default function CaptureBar({ onCapture, onSwitchCamera }: CaptureBarProps) {
  const { mode, isRecording, lastPhotoPath } = useCameraStore();

  return (
    <div className="flex shrink-0 items-center justify-around bg-black px-6 py-4">
      {/* Gallery Preview */}
      <button className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border-2 border-white/40 bg-[#374151]">
        {lastPhotoPath ? (
          <img
            src={convertFileSrc(lastPhotoPath)}
            alt="最近拍摄"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-green-500/30 to-blue-500/30" />
        )}
      </button>

      {/* Capture Button */}
      <button
        onClick={onCapture}
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-white transition-transform active:scale-95"
      >
        {mode === "video" ? (
          isRecording ? (
            <div className="h-5 w-5 rounded-sm bg-red-500" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-red-500" />
          )
        ) : (
          <div className="h-12 w-12 rounded-full bg-white" />
        )}
      </button>

      {/* Switch Camera */}
      <button
        onClick={onSwitchCamera}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
      >
        <RefreshCw size={20} />
      </button>
    </div>
  );
}
