import { useCameraStore } from "../../store";

interface PhotoViewerProps {
  onClose: () => void;
}

export default function PhotoViewer({ onClose }: PhotoViewerProps) {
  const { lastPhotoData } = useCameraStore();

  if (!lastPhotoData) return null;

  return (
    <div
      className="absolute inset-0 z-30 flex cursor-pointer items-center justify-center bg-black"
      onClick={onClose}
    >
      <img
        src={`data:image/jpeg;base64,${lastPhotoData}`}
        alt="照片"
        className="max-h-full max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
