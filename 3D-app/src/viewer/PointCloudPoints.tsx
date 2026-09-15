// 点云渲染核心：1 个 THREE.Points + 1 个 BufferGeometry，绝不逐点建对象

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { buildColorBuffer } from "../core/colorizer";
import type { ColorMode, PointCloudData } from "../core/types";

interface Props {
  data: PointCloudData;
  colorMode: ColorMode;
  size: number;
  visible: boolean;
}

const UNIFORM_COLOR: [number, number, number] = [0.62, 0.72, 0.55];

export function PointCloudPoints({ data, colorMode, size, visible }: Props) {
  // position 复用底层 TypedArray（零拷贝），color 按模式生成
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute(
      "color",
      new THREE.BufferAttribute(
        buildColorBuffer(data, colorMode, UNIFORM_COLOR),
        3
      )
    );
    g.computeBoundingSphere();
    return g;
  }, [data, colorMode]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        vertexColors: true,
        sizeAttenuation: true,
      }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);
  material.size = size;

  return <points geometry={geometry} material={material} visible={visible} />;
}
