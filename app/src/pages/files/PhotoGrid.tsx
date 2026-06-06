import { useCameraStore } from "../../store";
import { ImageIcon } from "lucide-react";

interface PhotoGridProps {
  onPhotoClick: (index: number) => void;
}

export default function PhotoGrid({ onPhotoClick }: PhotoGridProps) {
  const { photoList, thumbnailMap } = useCameraStore();

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-[#E2E8F0] bg-white px-6 py-3">
        <span className="text-[15px] font-medium text-[#0F172A]">图片管理</span>
        <span className="text-[13px] text-[#64748B]">{photoList.length} 张照片</span>
      </div>
      <div className="flex-1 overflow-auto bg-[#F8FAFC] p-4">
        {photoList.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-[14px] text-[#94A3B8]">暂无照片</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
            {photoList.map((photo, index) => (
              <button
                key={photo.id}
                onClick={() => onPhotoClick(index)}
                className="group overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                {thumbnailMap[photo.id] ? (
                  <img
                    src={`data:image/jpeg;base64,${thumbnailMap[photo.id]}`}
                    alt={photo.capturedAt}
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center bg-[#F1F5F9]">
                    <ImageIcon size={32} className="text-[#CBD5E1]" />
                  </div>
                )}
                <div className="px-2.5 py-2">
                  <p className="truncate text-[12px] text-[#1E293B]">{photo.capturedAt}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
