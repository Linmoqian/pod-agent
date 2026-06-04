import GalleryPreview from "./GalleryPreview";
import CaptureButton from "./CaptureButton";
import SwitchCameraButton from "./SwitchCameraButton";

interface CaptureBarProps {
  onCapture: () => void;
  onSwitchCamera: () => void;
}

export default function CaptureBar({ onCapture, onSwitchCamera }: CaptureBarProps) {
  return (
    <div className="flex shrink-0 items-center justify-around bg-black px-6 py-4">
      <GalleryPreview />
      <CaptureButton onClick={onCapture} />
      <SwitchCameraButton onClick={onSwitchCamera} />
    </div>
  );
}
