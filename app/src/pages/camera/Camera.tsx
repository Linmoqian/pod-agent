import { useState } from "react";
import { useCameraStore } from "../../store";
import CameraTopBar from "./CameraTopBar";
import CameraSettings from "./CameraSettings";
import Viewfinder from "./Viewfinder";
import ModeBar from "./ModeBar";
import CaptureBar from "./CaptureBar";
import CameraDevicePicker from "./CameraDevicePicker";
import PhotoViewer from "./PhotoViewer";

export default function Camera() {
  const { mode, toggleRecording, capturePhoto, switchDevice, devices, activeDeviceId } =
    useCameraStore();

  const [showSettings, setShowSettings] = useState(false);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [captured, setCaptured] = useState(false);

  const handleCapture = async () => {
    if (mode === "video") {
      toggleRecording();
      return;
    }

    const path = await capturePhoto();
    if (path) {
      setCaptured(true);
      setTimeout(() => setCaptured(false), 200);
    }
  };

  const handleSwitchCamera = () => {
    if (devices.length <= 1) return;
    setShowDevicePicker(true);
  };

  const handleSelectDevice = async (deviceId: string) => {
    setShowDevicePicker(false);
    if (deviceId !== activeDeviceId) {
      await switchDevice(deviceId);
    }
  };

  return (
    <div className="flex h-full flex-col bg-black">
      <CameraTopBar onToggleSettings={() => setShowSettings(!showSettings)} />
      {showSettings && <CameraSettings />}
      <Viewfinder captured={captured} />
      <ModeBar />
      <CaptureBar
        onCapture={handleCapture}
        onSwitchCamera={handleSwitchCamera}
        onViewPhoto={() => setShowPhotoViewer(true)}
      />

      {/* 设备选择器 */}
      {showDevicePicker && (
        <CameraDevicePicker
          onSelect={handleSelectDevice}
          onClose={() => setShowDevicePicker(false)}
        />
      )}

      {/* 全屏查看照片 */}
      {showPhotoViewer && <PhotoViewer onClose={() => setShowPhotoViewer(false)} />}
    </div>
  );
}
