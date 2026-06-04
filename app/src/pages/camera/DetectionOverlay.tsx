import type { Detection } from "../../store";

interface DetectionOverlayProps {
  detections: Detection[];
  canvasWidth: number;
  canvasHeight: number;
}

export default function DetectionOverlay({ detections, canvasWidth, canvasHeight }: DetectionOverlayProps) {
  if (!detections.length || !canvasWidth || !canvasHeight) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        className="relative"
        style={{ width: canvasWidth, height: canvasHeight }}
      >
        {detections.map((det, i) => {
          const left = (det.xMin / canvasWidth) * 100;
          const top = (det.yMin / canvasHeight) * 100;
          const width = ((det.xMax - det.xMin) / canvasWidth) * 100;
          const height = ((det.yMax - det.yMin) / canvasHeight) * 100;

          return (
            <div
              key={i}
              className="absolute"
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: `${width}%`,
                height: `${height}%`,
              }}
            >
              {/* 边框 */}
              <div className="absolute inset-0 rounded-sm border-2 border-green-400" />

              {/* 标签 */}
              <div className="absolute -top-5 left-0 flex items-center gap-1 rounded bg-green-400/90 px-1.5 py-0.5">
                <span className="text-[10px] font-medium text-black">
                  {det.className}
                </span>
                <span className="text-[10px] text-black/60">
                  {Math.round(det.confidence * 100)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
