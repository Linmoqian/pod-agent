import { useCameraStore } from "../../store";
import { usePhotoViewer } from "./hooks/usePhotoViewer";
import PhotoStripBar from "./PhotoStripBar";
import DetectionOverlay from "./DetectionOverlay";

interface PhotoViewerProps {
  onClose: () => void;
}

export default function PhotoViewer({ onClose }: PhotoViewerProps) {
  const { viewingPhotoData, closePhotoViewer } = useCameraStore();
  const { currentPhoto, parsedDetections } = usePhotoViewer();

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
      <div className="relative max-h-full max-w-full">
        <img
          src={`data:image/jpeg;base64,${viewingPhotoData}`}
          alt="照片"
          className="max-h-full max-w-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />

        {parsedDetections.length > 0 && currentPhoto && (
          <DetectionOverlay
            detections={parsedDetections}
            imageWidth={currentPhoto.width}
            imageHeight={currentPhoto.height}
          />
        )}
      </div>

      {/* 底部缩略图条 */}
      <PhotoStripBar />
    </div>
  );
}
