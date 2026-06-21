import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useChatStore, type PhotoRecord } from "../../store";

/** search_photos 工具返回的单张照片（camelCase，与后端 PhotoItem 一致） */
export interface PhotoItem {
  photoId: string;
  className: string;
  capturedAt: string;
  filePath: string;
  thumbnailPath: string;
  width: number;
  height: number;
  mode: string;
  batchLabel: string;
  count: number;
  avgConfidence: number;
}

/** 工具结果中的 PhotoItem 映射为右侧预览所需的 PhotoRecord */
function toRecord(p: PhotoItem): PhotoRecord {
  return {
    id: p.photoId,
    filePath: p.filePath,
    thumbnailPath: p.thumbnailPath,
    capturedAt: p.capturedAt,
    width: p.width,
    height: p.height,
    mode: p.mode,
    detections: null,
    batchLabel: p.batchLabel,
  };
}

export default function PhotoGrid({ photos }: { photos: PhotoItem[] }) {
  const setPreviewPhoto = useChatStore((s) => s.setPreviewPhoto);

  if (photos.length === 0) {
    return <p className="text-[12px] text-[#9CA3AF]">未找到照片</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((p) => (
        <Thumb key={p.photoId} item={p} onClick={() => setPreviewPhoto(toRecord(p))} />
      ))}
    </div>
  );
}

function Thumb({ item, onClick }: { item: PhotoItem; onClick: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    invoke<string>("read_photo_data", { path: item.thumbnailPath })
      .then((b64) => setSrc(b64))
      .catch(() => setFailed(true));
  }, [item.thumbnailPath]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-[#E5E7EB] bg-white hover:border-[#8B5CF6]"
    >
      {src && !failed ? (
        <img
          src={`data:image/jpeg;base64,${src}`}
          alt={item.className}
          className="h-full w-full object-cover"
        />
      ) : failed ? (
        <span className="text-[10px] text-[#9CA3AF]">加载失败</span>
      ) : (
        <span className="text-[10px] text-[#9CA3AF]">…</span>
      )}
    </button>
  );
}
