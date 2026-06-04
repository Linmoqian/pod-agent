import { useCameraStore } from "../../store";
import PhotoStripBar from "./PhotoStripBar";

interface PhotoViewerProps {
  onClose: () => void;
}

export default function PhotoViewer({ onClose }: PhotoViewerProps) {
  const { viewingPhotoData, closePhotoViewer } = useCameraStore();

  if (!viewingPhotoData) return null;

  const handleClose = () => {
    closePhotoViewer();
    onClose();
  };

  return (
    <div
      className="absolute inset-0 z-30 flex cursor-pointer items-center justify-center bg-black"
      onClick={handleClose}
    >
      <img
        src={`data:image/jpeg;base64,${viewingPhotoData}`}
        alt="照片"
        className="max-h-full max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {/* 底部缩略图条 */}
      <PhotoStripBar />
    </div>
  );
}
