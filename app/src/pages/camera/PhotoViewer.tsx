import { useCameraStore } from "../../store";
import { usePhotoViewer } from "./hooks/usePhotoViewer";
import PhotoStripBar from "./PhotoStripBar";
import DetectionOverlay from "./DetectionOverlay";
import PhenotypePanel from "./PhenotypePanel";

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

  const hasDetections = parsedDetections.length > 0 && currentPhoto;

  return (
    <div
      className="absolute inset-0 z-30 flex cursor-pointer items-stretch bg-black"
      onClick={handleClose}
    >
      {/* 照片区域 */}
      <div className="relative flex flex-1 items-center justify-center">
        <div className="relative max-h-full max-w-full">
          <img
            src={`data:image/jpeg;base64,${viewingPhotoData}`}
            alt="照片"
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {hasDetections && (
            <DetectionOverlay
              detections={parsedDetections}
              imageWidth={currentPhoto.width}
              imageHeight={currentPhoto.height}
            />
          )}
        </div>
      </div>

      {/* 右侧表型统计面板 */}
      {currentPhoto && (
        <PhenotypePanel photoId={currentPhoto.id} />
      )}

      {/* 底部缩略图条 */}
      <PhotoStripBar />
    </div>
  );
}
