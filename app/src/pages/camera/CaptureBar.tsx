import GalleryPreview from "./GalleryPreview";
import CaptureButton from "./CaptureButton";
import SwitchCameraButton from "./SwitchCameraButton";

interface CaptureBarProps {
  onCapture: () => void;
  onSwitchCamera: () => void;
  onViewPhoto: () => void;
}

export default function CaptureBar({ onCapture, onSwitchCamera, onViewPhoto }: CaptureBarProps) {
  return (
    <div className="flex shrink-0 items-center justify-around bg-black px-6 py-4">
      <GalleryPreview onClick={onViewPhoto} />
      <CaptureButton onClick={onCapture} />
      <SwitchCameraButton onClick={onSwitchCamera} />
    </div>
  );
}
