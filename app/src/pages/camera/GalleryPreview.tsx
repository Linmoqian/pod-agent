import { convertFileSrc } from "@tauri-apps/api/core";
import { useCameraStore } from "../../store";

export default function GalleryPreview() {
  const { lastPhotoPath } = useCameraStore();

  return (
    <button className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border-2 border-white/40 bg-[#374151]">
      {lastPhotoPath ? (
        <img
          src={convertFileSrc(lastPhotoPath)}
          alt="最近拍摄"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-green-500/30 to-blue-500/30" />
      )}
    </button>
  );
}
