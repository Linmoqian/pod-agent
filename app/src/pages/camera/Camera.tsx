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
  const [captured, setCaptured] = useState(false);

  const handleCapture = () => {
    if (mode === "video") {
      toggleRecording();
    } else {
      setCaptured(true);
      setTimeout(() => setCaptured(false), 200);
    }
  };

  const handleSwitchCamera = () => {
    alert("切换前后摄像头");
  };

  return (
    <div className="flex h-full flex-col bg-black">
      <CameraTopBar onToggleSettings={() => setShowSettings(!showSettings)} />
      {showSettings && <CameraSettings />}
      <Viewfinder captured={captured} />
      <ModeBar />
      <CaptureBar onCapture={handleCapture} onSwitchCamera={handleSwitchCamera} />
    </div>
  );
}
