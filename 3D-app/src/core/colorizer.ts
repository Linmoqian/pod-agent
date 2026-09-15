// PointCloudData → 顶点色 Float32Array(0-1)；按需生成，切换着色模式时重建 color buffer

import type { ColorMode, PointCloudData } from "./types";

// 高度色带：深紫 → 蓝 → 绿 → 黄 → 红（分段线性）
const RAMP: ReadonlyArray<readonly [number, number, number]> = [
  [47, 16, 62],
  [28, 96, 148],
  [63, 168, 122],
  [243, 199, 64],
  [214, 62, 42],
];

function rampAt(t: number, out: [number, number, number]): void {
  const x = Math.min(Math.max(t, 0), 1) * (RAMP.length - 1);
  const i = Math.min(Math.floor(x), RAMP.length - 2);
  const f = x - i;
  const a = RAMP[i];
  const b = RAMP[i + 1];
  out[0] = (a[0] + (b[0] - a[0]) * f) / 255;
  out[1] = (a[1] + (b[1] - a[1]) * f) / 255;
  out[2] = (a[2] + (b[2] - a[2]) * f) / 255;
}

export function buildColorBuffer(
  data: PointCloudData,
  mode: ColorMode,
  uniform: [number, number, number]
): Float32Array {
  const n = data.pointCount;
  const out = new Float32Array(n * 3);
  const rgb: [number, number, number] = [0, 0, 0];

  if (mode === "rgb" && data.colors) {
    const c = data.colors;
    for (let i = 0; i < n; i++) {
      out[i * 3] = c[i * 3] / 255;
      out[i * 3 + 1] = c[i * 3 + 1] / 255;
      out[i * 3 + 2] = c[i * 3 + 2] / 255;
    }
    return out;
  }

  if (mode === "height") {
    const minY = data.bounds.min[1];
    const span = data.bounds.max[1] - minY || 1;
    for (let i = 0; i < n; i++) {
      const y = data.positions[i * 3 + 1];
      rampAt((y - minY) / span, rgb);
      out[i * 3] = rgb[0];
      out[i * 3 + 1] = rgb[1];
      out[i * 3 + 2] = rgb[2];
    }
    return out;
  }

  if (mode === "intensity" && data.intensity) {
    const arr = data.intensity;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = arr[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const span = hi - lo || 1;
    for (let i = 0; i < n; i++) {
      const g = (arr[i] - lo) / span;
      out[i * 3] = g;
      out[i * 3 + 1] = g;
      out[i * 3 + 2] = g;
    }
    return out;
  }

  // uniform（或数据缺失时的回退）
  for (let i = 0; i < n; i++) {
    out[i * 3] = uniform[0];
    out[i * 3 + 1] = uniform[1];
    out[i * 3 + 2] = uniform[2];
  }
  return out;
}
