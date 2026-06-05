import { useCameraPreview } from "./hooks/useCameraPreview";
import { useCameraStore } from "../../store";
import GridOverlay from "./GridOverlay";
import DetectionOverlay from "./DetectionOverlay";

interface ViewfinderProps {
  captured: boolean;
}

export default function Viewfinder({ captured }: ViewfinderProps) {
  const { canvasRef, isStreaming } = useCameraPreview();
  const { isDetecting, detections } = useCameraStore();

  // 用 canvas 内部分辨率（等于摄像头像素，YOLO 坐标也基于此）
  const canvas = canvasRef.current;
  const imageWidth = canvas?.width ?? 0;
  const imageHeight = canvas?.height ?? 0;

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#1A1A2E]">
      {/* 实时摄像头画面 */}
      <canvas
        ref={canvasRef}
        className={`h-full w-full object-contain ${isStreaming ? "opacity-100" : "opacity-0"}`}
      />

      {/* 未连接占位 */}
      {!isStreaming && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-white/40">正在连接摄像头…</p>
        </div>
      )}

      {/* 拍照闪光 */}
      {captured && <div className="absolute inset-0 bg-white" />}

      {/* YOLO 检测框：用 canvas 内部分辨率算百分比，CSS 容器与 canvas 同尺寸 */}
      {isDetecting && imageWidth > 0 && imageHeight > 0 && (
        <DetectionOverlay
          detections={detections}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
        />
      )}

      {/* 网格 + 对焦框 */}
      <GridOverlay />
    </div>
  );
}
