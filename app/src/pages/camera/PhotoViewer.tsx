import { ChevronUp, ChevronDown } from "lucide-react";
import { useCameraStore } from "../../store";

interface PhotoViewerProps {
  onClose: () => void;
}

export default function PhotoViewer({ onClose }: PhotoViewerProps) {
  const { viewingPhotoData, photoList, currentPhotoIndex, navigatePhoto, closePhotoViewer } =
    useCameraStore();

  if (!viewingPhotoData) return null;

  const hasPrev = currentPhotoIndex < photoList.length - 1;
  const hasNext = currentPhotoIndex > 0;

  // 注意：photoList 按 captured_at DESC 排序，索引 0 = 最新
  // 向上 = 看更新的（index 减小），向下 = 看更旧的（index 增大）

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

      {/* 上一个（更新的） */}
      {hasPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigatePhoto(-1);
          }}
          className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-white/20 p-2 text-white hover:bg-white/30"
        >
          <ChevronUp size={24} />
        </button>
      )}

      {/* 下一个（更旧的） */}
      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigatePhoto(1);
          }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/20 p-2 text-white hover:bg-white/30"
        >
          <ChevronDown size={24} />
        </button>
      )}

      {/* 索引指示器 */}
      <div className="absolute bottom-4 right-4 rounded-full bg-white/20 px-3 py-1 text-[12px] text-white">
        {currentPhotoIndex + 1} / {photoList.length}
      </div>
    </div>
  );
}
