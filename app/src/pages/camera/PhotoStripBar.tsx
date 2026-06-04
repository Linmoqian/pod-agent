import { useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCameraStore } from "../../store";

export default function PhotoStripBar() {
  const { photoList, currentPhotoIndex, thumbnailMap } = useCameraStore();
  const stripRef = useRef<HTMLDivElement>(null);

  // 当前照片变化时自动滚动到可见区域
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const active = strip.children[currentPhotoIndex] as HTMLElement;
    if (!active) return;
    active.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [currentPhotoIndex]);

  const handleClick = async (index: number) => {
    if (index === currentPhotoIndex) return;
    const { photoList } = useCameraStore.getState();
    try {
      const b64 = await invoke<string>("read_photo_data", { path: photoList[index].filePath });
      useCameraStore.setState({ currentPhotoIndex: index, viewingPhotoData: b64 });
    } catch (e) {
      console.error("加载照片失败:", e);
    }
  };

  if (photoList.length <= 1) return null;

  return (
    <div
      className="absolute bottom-0 left-0 right-0 flex items-center bg-black/60 px-4 py-2"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        ref={stripRef}
        className="flex gap-2 overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {photoList.map((photo, index) => (
          <button
            key={photo.id}
            onClick={() => handleClick(index)}
            className={`h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
              index === currentPhotoIndex
                ? "scale-110 border-white"
                : "border-white/30 opacity-60 hover:opacity-100"
            }`}
          >
            {thumbnailMap[photo.id] ? (
              <img
                src={`data:image/jpeg;base64,${thumbnailMap[photo.id]}`}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-white/10" />
            )}
          </button>
        ))}
      </div>

      <span className="ml-auto shrink-0 text-[12px] text-white/60">
        {currentPhotoIndex + 1}/{photoList.length}
      </span>
    </div>
  );
}
