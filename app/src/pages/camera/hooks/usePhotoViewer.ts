import { useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCameraStore, type Detection } from "../../../store";

export function usePhotoViewer() {
  const photoList = useCameraStore((s) => s.photoList);
  const currentPhotoIndex = useCameraStore((s) => s.currentPhotoIndex);
  const currentPhoto = photoList[currentPhotoIndex];

  const parsedDetections: Detection[] = useMemo(
    () => (currentPhoto?.detections ? JSON.parse(currentPhoto.detections) : []),
    [currentPhoto?.detections],
  );

  const loadPhoto = async (index: number) => {
    if (index === currentPhotoIndex) return;
    const { photoList } = useCameraStore.getState();
    try {
      const b64 = await invoke<string>("read_photo_data", { path: photoList[index].filePath });
      useCameraStore.setState({ currentPhotoIndex: index, viewingPhotoData: b64 });
    } catch (e) {
      console.error("加载照片失败:", e);
    }
  };

  return { currentPhoto, parsedDetections, loadPhoto };
}
