import { ScanEye, Eye, EyeOff } from "lucide-react";
import GalleryPreview from "./GalleryPreview";
import CaptureButton from "./CaptureButton";
import SwitchCameraButton from "./SwitchCameraButton";
import { useCameraStore } from "../../store";
import { useCameraActions } from "./hooks/useCameraActions";

interface CaptureBarProps {
  onCapture: () => void;
  onSwitchCamera: () => void;
  onViewPhoto: () => void;
}

export default function CaptureBar({ onCapture, onSwitchCamera, onViewPhoto }: CaptureBarProps) {
  const { yoloLoaded, isDetecting } = useCameraStore();
  const { handleYoloToggle } = useCameraActions();

  return (
    <div className="flex shrink-0 items-center justify-around bg-black px-6 py-4">
      <GalleryPreview onClick={onViewPhoto} />

      {/* YOLO 检测按钮 */}
      <button
        onClick={handleYoloToggle}
        className={`flex flex-col items-center gap-1 rounded-full p-3 transition-colors ${
          isDetecting
            ? "bg-green-500/20 text-green-400"
            : "text-white/60 hover:text-white"
        }`}
        title={yoloLoaded ? (isDetecting ? "关闭检测" : "开启检测") : "加载模型并检测"}
      >
        {isDetecting ? <EyeOff size={22} /> : yoloLoaded ? <Eye size={22} /> : <ScanEye size={22} />}
        <span className="text-[10px]">{isDetecting ? "关闭" : "检测"}</span>
      </button>

      <CaptureButton onClick={onCapture} />
      <SwitchCameraButton onClick={onSwitchCamera} />
    </div>
  );
}
