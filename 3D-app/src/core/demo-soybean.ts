// 程序化生成模拟大豆植株点云（茎/叶柄/叶片/豆荚/地面散射），用于无真实数据时验证 Viewer

import { computeBounds } from "./bounds";
import type { PointCloudData } from "./types";

// 可复现的伪随机数
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TWO_PI = Math.PI * 2;

interface LeafSpec {
  t: number; // 着生高度比例
  yaw: number; // 方位角
  pitch: number; // 上翘角
  len: number; // 叶长
  width: number; // 叶宽
}

export function generateSoybeanDemo(targetPoints = 600_000): PointCloudData {
  const rand = mulberry32(20260913);
  const positions = new Float32Array(targetPoints * 3);
  const colors = new Uint8Array(targetPoints * 3);
  let n = 0;

  const push = (
    x: number,
    y: number,
    z: number,
    r: number,
    g: number,
    b: number
  ): void => {
    if (n >= targetPoints) return;
    const i = n * 3;
    positions[i] = x;
    positions[i + 1] = y;
    positions[i + 2] = z;
    colors[i] = Math.min(255, Math.max(0, Math.round(r)));
    colors[i + 1] = Math.min(255, Math.max(0, Math.round(g)));
    colors[i + 2] = Math.min(255, Math.max(0, Math.round(b)));
    n++;
  };

  const plantH = 0.78;
  // 主茎水平弯曲（正弦 + 顶部倾倒）
  const stemX = (t: number): number => Math.sin(t * 2.1) * 0.022 + t * t * 0.03;

  // ---- 叶片布局（先于叶柄生成，供其引用）----
  const leaves: LeafSpec[] = [0.3, 0.48, 0.66, 0.82].map((t, i) => ({
    t,
    yaw: i * 2.4 + rand() * 0.8,
    pitch: 0.32 + rand() * 0.3,
    len: 0.11 + rand() * 0.035,
    width: 0.1 + rand() * 0.035,
  }));
  const leafBase = (leaf: LeafSpec): [number, number, number] => [
    stemX(leaf.t) + Math.cos(leaf.yaw) * 0.07,
    leaf.t * plantH + 0.04 - 0.02,
    Math.sin(leaf.yaw) * 0.07,
  ];

  // ---- 主茎 10% ----
  {
    const count = Math.floor(targetPoints * 0.1);
    for (let i = 0; i < count && n < targetPoints; i++) {
      const t = rand();
      const y = t * plantH;
      const ang = rand() * TWO_PI;
      const rad = 0.009 * Math.sqrt(rand());
      // 底部偏棕褐，向上转绿
      const brown = Math.max(0, 0.35 - t * 0.5);
      const shade = (rand() - 0.5) * 16;
      push(
        stemX(t) + Math.cos(ang) * rad,
        y,
        Math.sin(ang) * rad,
        86 + (110 - 86) * brown + shade,
        124 + (92 - 124) * brown + shade,
        60 + (56 - 60) * brown + shade * 0.6
      );
    }
  }

  // ---- 叶柄 4% ----
  {
    const count = Math.floor(targetPoints * 0.04);
    for (let i = 0; i < count && n < targetPoints; i++) {
      const leaf = leaves[Math.floor(rand() * leaves.length)];
      const s = rand();
      const sx = stemX(leaf.t);
      const sy = leaf.t * plantH;
      const dx = Math.cos(leaf.yaw);
      const dz = Math.sin(leaf.yaw);
      const shade = (rand() - 0.5) * 14;
      push(
        sx + dx * 0.07 * s + (rand() - 0.5) * 0.004,
        sy + 0.04 * s * (1 - s * 0.4),
        dz * 0.07 * s + (rand() - 0.5) * 0.004,
        74 + shade,
        112 + shade,
        56 + shade * 0.6
      );
    }
  }

  // ---- 叶片 52%（卵形轮廓 + 下垂弯曲 + 叶脉）----
  {
    const count = Math.floor(targetPoints * 0.52);
    for (let i = 0; i < count && n < targetPoints; i++) {
      const leaf = leaves[Math.floor(rand() * leaves.length)];
      const u = Math.pow(rand(), 0.9);
      const wProfile = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.8);
      const v = (rand() * 2 - 1) * wProfile;
      const lx = u * leaf.len;
      const ly = v * leaf.width * 0.5;
      const droop = (0.45 * lx * lx) / leaf.len;
      const [bx, by, bz] = leafBase(leaf);
      const cy = Math.cos(leaf.yaw);
      const sy = Math.sin(leaf.yaw);
      const cp = Math.cos(leaf.pitch);
      const sp = Math.sin(leaf.pitch);
      const vein = Math.abs(v) < 0.06 ? -16 : 0; // 主脉偏暗
      const shade = (rand() - 0.5) * 22 + vein;
      push(
        bx + cy * cp * lx - sy * ly + (rand() - 0.5) * 0.0022,
        by + sp * lx * 0.25 - droop + (rand() - 0.5) * 0.0022,
        bz + sy * cp * lx + cy * ly + (rand() - 0.5) * 0.0022,
        52 + shade,
        118 + shade,
        50 + shade * 0.6
      );
    }
  }

  // ---- 豆荚 22%（椭球 + 淡条纹）----
  {
    const count = Math.floor(targetPoints * 0.22);
    for (let i = 0; i < count && n < targetPoints; i++) {
      const t = 0.42 + rand() * 0.4;
      const yaw = rand() * TWO_PI;
      const u = rand() * 2 - 1;
      const ang = rand() * TWO_PI;
      const rr = Math.sqrt(rand());
      const along = u * 0.034;
      const bulge = 1 - u * u * 0.25;
      const off = 0.012 + rand() * 0.004;
      const sx = stemX(t);
      const sy = t * plantH;
      const stripe = Math.abs(Math.sin(ang * 2)) < 0.25 ? -20 : 0;
      const jitter = (rand() - 0.5) * 12;
      push(
        sx + Math.cos(yaw) * (off + along) + Math.cos(ang) * 0.011 * rr * bulge,
        sy + Math.sin(ang) * 0.011 * rr * bulge - 0.006,
        Math.sin(yaw) * (off + along) + Math.sin(ang) * 0.011 * rr * bulge,
        150 + stripe + jitter,
        168 + stripe + jitter,
        84 + stripe * 0.5 + jitter * 0.5
      );
    }
  }

  // ---- 地面散射 12% + 兜底填满 ----
  while (n < targetPoints) {
    const ang = rand() * TWO_PI;
    const rad = 0.26 * Math.sqrt(rand());
    const shade = (rand() - 0.5) * 26;
    push(
      Math.cos(ang) * rad,
      (rand() - 0.5) * 0.006,
      Math.sin(ang) * rad,
      96 + shade,
      78 + shade,
      58 + shade * 0.7
    );
  }

  return {
    positions,
    colors,
    intensity: null,
    pointCount: n,
    bounds: computeBounds(positions, n),
  };
}
