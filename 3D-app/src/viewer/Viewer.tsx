// Viewer 场景组装：Canvas + Grid + Axes + Points + CameraRig

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid } from "@react-three/drei";
import { boundsRadius, frameOffset, niceStep } from "../core/bounds";
import type { ColorMode, PointCloudData } from "../core/types";
import { PointCloudPoints } from "./PointCloudPoints";
import { CameraRig } from "./CameraRig";
import { FpsProbe } from "./FpsProbe";

export interface ViewerProps {
  data: PointCloudData | null;
  colorMode: ColorMode;
  pointSize: number;
  showPoints: boolean;
  showGrid: boolean;
  showAxes: boolean;
  background: string;
  gridColor: string;
  sectionColor: string;
  fitNonce: number;
  onFps: (fps: number) => void;
  onTarget: (t: [number, number, number]) => void;
}

export function Viewer(props: ViewerProps) {
  const { data } = props;

  // Grid / 坐标轴尺度跟随点云包围盒
  const sceneScale = useMemo(() => {
    const radius = data ? boundsRadius(data.bounds) : 0.35;
    const cell = niceStep(radius / 6);
    return { cell, fade: radius * 25 + 5, axis: radius * 0.7 };
  }, [data]);

  // 自动居中：水平居中 + 底面贴 Grid（零拷贝，仅移动 group）
  const offset = useMemo<[number, number, number]>(
    () => (data ? frameOffset(data.bounds) : [0, 0, 0]),
    [data]
  );

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 50, near: 0.01, far: 2000, position: [1.6, 1.2, 1.6] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={[props.background]} />

      {props.showGrid && (
        <Grid
          infiniteGrid
          cellSize={sceneScale.cell}
          sectionSize={sceneScale.cell * 5}
          cellThickness={0.6}
          sectionThickness={1.1}
          cellColor={props.gridColor}
          sectionColor={props.sectionColor}
          fadeDistance={sceneScale.fade}
          fadeStrength={1.2}
          followCamera={false}
        />
      )}
      {props.showAxes && <axesHelper args={[sceneScale.axis]} />}

      {data && (
        <group position={offset}>
          <PointCloudPoints
            data={data}
            colorMode={props.colorMode}
            size={props.pointSize}
            visible={props.showPoints}
          />
        </group>
      )}

      <CameraRig data={data} fitNonce={props.fitNonce} onTargetChange={props.onTarget} />
      <FpsProbe onFps={props.onFps} />
    </Canvas>
  );
}
