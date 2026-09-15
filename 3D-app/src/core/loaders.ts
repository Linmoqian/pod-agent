// 文件 → PointCloudData 的加载适配层；解析为同步（V1），V2 迁入 Web Worker

import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader.js";
import type { BufferGeometry } from "three";
import { computeBounds } from "./bounds";
import type { PointCloudData } from "./types";

function toPointCloudData(geometry: BufferGeometry): PointCloudData {
  const pos = geometry.getAttribute("position");
  if (!pos || pos.count === 0) {
    throw new Error("文件中不包含点坐标（position）数据");
  }
  const pointCount = pos.count;

  // 复制一份，避免依赖 loader 内部缓冲的生命周期
  const positions =
    pos.array instanceof Float32Array
      ? pos.array.slice()
      : new Float32Array(pos.array as ArrayLike<number>);

  // PLY/PCD loader 输出 0-1 Float 颜色，统一转 0-255 Uint8 存储
  let colors: Uint8Array | null = null;
  const colorAttr = geometry.getAttribute("color");
  if (colorAttr && colorAttr.count === pointCount) {
    const src = colorAttr.array as ArrayLike<number>;
    colors = new Uint8Array(pointCount * 3);
    for (let i = 0; i < pointCount * 3; i++) {
      const v = src[i];
      // 兼容 0-1 与意外直接存 0-255 两种来源
      colors[i] =
        v <= 1
          ? Math.round(Math.min(Math.max(v, 0), 1) * 255)
          : Math.min(Math.round(v), 255);
    }
  }

  // PLYLoader 不保留自定义属性，intensity 目前主要来自 PCD
  let intensity: Float32Array | null = null;
  const intAttr = geometry.getAttribute("intensity");
  if (intAttr && intAttr.count === pointCount) {
    intensity =
      intAttr.array instanceof Float32Array
        ? intAttr.array.slice()
        : new Float32Array(intAttr.array as ArrayLike<number>);
  }

  return {
    positions,
    colors,
    intensity,
    pointCount,
    bounds: computeBounds(positions, pointCount),
  };
}

export function loadPointCloud(
  buffer: ArrayBuffer,
  fileName: string
): PointCloudData {
  const lower = fileName.toLowerCase();
  // PCDLoader.parse 返回 Points 对象，PLYLoader.parse 返回 BufferGeometry，统一取出
  const parsed = lower.endsWith(".pcd")
    ? new PCDLoader().parse(buffer)
    : new PLYLoader().parse(buffer);
  const maybePoints = parsed as { geometry?: BufferGeometry };
  const geometry: BufferGeometry =
    maybePoints.geometry ?? (parsed as BufferGeometry);
  const data = toPointCloudData(geometry);
  geometry.dispose();
  return data;
}
