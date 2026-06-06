import type { Detection } from "../../store";

interface DetectionOverlayProps {
  detections: Detection[];
  imageWidth: number;
  imageHeight: number;
}

/**
 * 检测框叠加层。
 * 使用 SVG viewBox + preserveAspectRatio="xMidYMid meet" 与 canvas object-contain 完全对齐。
 * 检测坐标直接在 viewBox 坐标空间（= 原图像素空间）使用，无需 CSS 尺寸计算。
 */
export default function DetectionOverlay({ detections, imageWidth, imageHeight }: DetectionOverlayProps) {
  if (!detections.length) return null;

  return (
    <svg
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {detections.map((det, i) => {
        const x = det.xMin;
        const y = det.yMin;
        const w = det.xMax - det.xMin;
        const h = det.yMax - det.yMin;

        return (
          <g key={i}>
            {/* 检测框 */}
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill="none"
              stroke="rgb(74, 222, 128)"
              strokeWidth="2"
              rx="2"
              vectorEffect="non-scaling-stroke"
            />

            {/* 标签背景 */}
            <rect
              x={x}
              y={y - 18}
              width={det.className.length * 8 + 36}
              height="18"
              fill="rgba(74, 222, 128, 0.9)"
              rx="2"
            />

            {/* 标签文字 */}
            <text
              x={x + 4}
              y={y - 4}
              fill="black"
              fontSize="12"
              fontFamily="system-ui, sans-serif"
              fontWeight="500"
            >
              {det.className} {Math.round(det.confidence * 100)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
