import { useState } from "react";
import { useCameraStore } from "../../store";
import CameraTopBar from "./CameraTopBar";
import CameraSettings from "./CameraSettings";
import Viewfinder from "./Viewfinder";
import ModeBar from "./ModeBar";
import CaptureBar from "./CaptureBar";

export default function Camera() {
  const { mode, toggleRecording } = useCameraStore();

  const [showSettings, setShowSettings] = useState(false);

  const handleCapture = () => {
    if (mode === "video") {
      toggleRecording();
    } else {
      // TODO: 调用 Rust 拍照命令
    }
  };

  const handleSwitchCamera = () => {
    // TODO: 切换摄像头设备
  };

  return (
    <div className="flex h-full flex-col bg-black">
      <CameraTopBar onToggleSettings={() => setShowSettings(!showSettings)} />
      {showSettings && <CameraSettings />}
      <Viewfinder />
      <ModeBar />
      <CaptureBar onCapture={handleCapture} onSwitchCamera={handleSwitchCamera} />
    </div>
  );
}
