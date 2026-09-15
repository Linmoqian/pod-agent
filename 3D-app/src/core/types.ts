// 点云数据层核心类型：渲染层只认识 PointCloudData，不关心来源（PLY/PCD/LAS/WebSocket）

export interface PointCloudBounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface PointCloudData {
  /** xyz 交错，长度 pointCount * 3 */
  positions: Float32Array;
  /** 0-255 RGB 交错，长度 pointCount * 3；无颜色时为 null */
  colors: Uint8Array | null;
  /** 反射强度；数据源未提供时为 null */
  intensity: Float32Array | null;
  pointCount: number;
  bounds: PointCloudBounds;
}

export type ColorMode = "rgb" | "height" | "intensity" | "uniform";
