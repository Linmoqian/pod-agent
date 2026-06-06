import { useState, useEffect } from "react";
import { useCameraStore } from "../../store";
import FileSidebar from "./FileSidebar";
import FileListView from "./FileListView";
import PhotoGrid from "./PhotoGrid";
import PhotoViewer from "../camera/PhotoViewer";

export default function FileManager() {
  const { loadPhotoList, openPhotoViewer } = useCameraStore();

  const [activeNav, setActiveNav] = useState("全部文件");
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);

  const isPhotoMode = activeNav === "图片管理";

  useEffect(() => {
    if (isPhotoMode) {
      loadPhotoList();
    }
  }, [isPhotoMode]);

  const handlePhotoClick = (index: number) => {
    openPhotoViewer(index);
    setShowPhotoViewer(true);
  };

  return (
    <div className="flex h-full bg-[#F8FAFC]">
      <FileSidebar activeNav={activeNav} onNavChange={setActiveNav} />

      {isPhotoMode ? (
        <PhotoGrid onPhotoClick={handlePhotoClick} />
      ) : (
        <FileListView />
      )}

      {showPhotoViewer && <PhotoViewer onClose={() => setShowPhotoViewer(false)} />}
    </div>
  );
}
