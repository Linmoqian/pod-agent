import { useEffect } from "react";
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
  const currentBatchLabel = useCameraStore((s) => s.currentBatchLabel);
  const batchLabels = useCameraStore((s) => s.batchLabels);
  const setBatchLabel = useCameraStore((s) => s.setBatchLabel);
  const loadBatchLabels = useCameraStore((s) => s.loadBatchLabels);
  const exportPhenotypes = useCameraStore((s) => s.exportPhenotypes);

  useEffect(() => {
    loadBatchLabels();
  }, [loadBatchLabels]);

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

      {/* 顶部批次栏：输入 + datalist（历史复用）+ 导出此批按钮 */}
      <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/40 to-transparent px-3 py-2">
        <input
          list="batch-labels"
          value={currentBatchLabel}
          onChange={(e) => setBatchLabel(e.target.value)}
          placeholder="批次（如 A小区-3棚）"
          className="rounded-md border border-white/20 bg-white/80 px-3 py-1.5 text-[13px] text-[#111827] outline-none focus:border-[#007AFF]"
        />
        <datalist id="batch-labels">
          {batchLabels.map((label) => (
            <option key={label} value={label} />
          ))}
        </datalist>
        <button
          disabled={!currentBatchLabel}
          onClick={async () => {
            const path = await exportPhenotypes();
            if (path) {
              alert(`已导出：${path}`);
            } else {
              alert("导出失败或该批次无表型数据");
            }
          }}
          className="rounded-md bg-[#007AFF] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
        >
          导出此批
        </button>
      </div>

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
