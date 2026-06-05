import type { Detection } from "../../store";

interface DetectionOverlayProps {
  detections: Detection[];
  imageWidth: number;
  imageHeight: number;
}

/**
 * 检测框叠加层。
 * imageWidth/imageHeight 是 canvas 内部分辨率（摄像头原始像素，也是 YOLO 坐标的基准）。
 * 外层容器用 object-contain 保持与 canvas 画面相同的宽高比和居中方式。
 */
export default function DetectionOverlay({ detections, imageWidth, imageHeight }: DetectionOverlayProps) {
  if (!detections.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div
        className="relative max-h-full max-w-full"
        style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }}
      >
        {detections.map((det, i) => {
          const left = (det.xMin / imageWidth) * 100;
          const top = (det.yMin / imageHeight) * 100;
          const width = ((det.xMax - det.xMin) / imageWidth) * 100;
          const height = ((det.yMax - det.yMin) / imageHeight) * 100;

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
