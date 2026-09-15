// 相机装配：加载数据 / Reset 时按包围盒拟合视锥，并节流上报 OrbitControls target

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { boundsCenter, boundsRadius, shiftBounds } from "../core/bounds";
import type { PointCloudData } from "../core/types";

interface Props {
  data: PointCloudData | null;
  fitNonce: number;
  onTargetChange: (t: [number, number, number]) => void;
}

type ControlsRef = React.ComponentRef<typeof OrbitControls>;

export function CameraRig({ data, fitNonce, onTargetChange }: Props) {
  const controlsRef = useRef<ControlsRef>(null);
  const camera = useThree((s) => s.camera);

  // 数据变化或 fitNonce 变化（Reset）时执行一次 fit
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !data) return;

    const offset: [number, number, number] = [
      -(data.bounds.min[0] + data.bounds.max[0]) / 2,
      -data.bounds.min[1],
      -(data.bounds.min[2] + data.bounds.max[2]) / 2,
    ];
    const bounds = shiftBounds(data.bounds, offset);
    const center = boundsCenter(bounds);
    const radius = Math.max(boundsRadius(bounds), 1e-3);

    const fovRad = (((camera as THREE.PerspectiveCamera).fov ?? 50) * Math.PI) / 180;
    const dist = (radius / Math.sin(fovRad / 2)) * 1.05;
    const dir = new THREE.Vector3(1, 0.55, 1).normalize();

    camera.position.set(
      center[0] + dir.x * dist,
      center[1] + dir.y * dist,
      center[2] + dir.z * dist
    );
    camera.near = Math.max(radius / 200, 1e-4);
    camera.far = dist * 100;
    camera.updateProjectionMatrix();

    controls.target.set(center[0], center[1], center[2]);
    controls.update();
  }, [data, fitNonce, camera]);

  // 每 12 帧上报一次 target 坐标（约 5 次/秒），避免高频 setState
  const frame = useRef(0);
  useFrame(() => {
    if (++frame.current % 12 !== 0) return;
    const t = controlsRef.current?.target;
    if (t) onTargetChange([t.x, t.y, t.z]);
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      zoomSpeed={0.9}
    />
  );
}
