import { useCameraPreview } from "./hooks/useCameraPreview";
import { useCameraStore } from "../../store";
import GridOverlay from "./GridOverlay";
import DetectionOverlay from "./DetectionOverlay";

interface ViewfinderProps {
  captured: boolean;
}

export default function Viewfinder({ captured }: ViewfinderProps) {
  const { canvasRef, isStreaming } = useCameraPreview();
  const { isDetecting, detections, frameWidth, frameHeight } = useCameraStore();

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

      {/* YOLO 检测框：帧尺寸从 store 读取（reactive），不再从 canvas DOM 读取 */}
      {isDetecting && frameWidth > 0 && frameHeight > 0 && (
        <DetectionOverlay
          detections={detections}
          imageWidth={frameWidth}
          imageHeight={frameHeight}
        />
      )}

      {/* 网格 + 对焦框 */}
      <GridOverlay />
    </div>
  );
}
