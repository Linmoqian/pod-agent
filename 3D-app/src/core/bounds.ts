// 包围盒与展示坐标系的几何小工具：loaders / demo / viewer 共用

import type { PointCloudBounds } from "./types";

export function computeBounds(
  positions: Float32Array,
  pointCount: number
): PointCloudBounds {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < pointCount; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX)) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

export function boundsCenter(b: PointCloudBounds): [number, number, number] {
  return [
    (b.min[0] + b.max[0]) / 2,
    (b.min[1] + b.max[1]) / 2,
    (b.min[2] + b.max[2]) / 2,
  ];
}

export function boundsSize(b: PointCloudBounds): [number, number, number] {
  return [
    b.max[0] - b.min[0],
    b.max[1] - b.min[1],
    b.max[2] - b.min[2],
  ];
}

/** 对角线半径，作为相机距离 / 点大小的尺度基准 */
export function boundsRadius(b: PointCloudBounds): number {
  const [dx, dy, dz] = boundsSize(b);
  return Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;
}

/**
 * 展示偏移：水平居中 + 底面贴 y=0（Grid 地面）。
 * 数据层保持原始坐标，零拷贝，仅移动 THREE.Points 所在 group。
 */
export function frameOffset(b: PointCloudBounds): [number, number, number] {
  const [cx, , cz] = boundsCenter(b);
  return [-cx, -b.min[1], -cz];
}

/** 偏移后的包围盒（世界坐标），供相机 fit 使用 */
export function shiftBounds(
  b: PointCloudBounds,
  offset: [number, number, number]
): PointCloudBounds {
  return {
    min: [b.min[0] + offset[0], b.min[1] + offset[1], b.min[2] + offset[2]],
    max: [b.max[0] + offset[0], b.max[1] + offset[1], b.max[2] + offset[2]],
  };
}

/** 1/2/5 x 10^k 的"好看"步长，用于 Grid 尺度 */
export function niceStep(x: number): number {
  if (!(x > 0)) return 0.1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}
