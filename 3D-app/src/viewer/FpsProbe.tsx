// FPS 探针：在渲染循环内计数，每 500ms 上报一次

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

export function FpsProbe({ onFps }: { onFps: (fps: number) => void }) {
  const frames = useRef(0);
  const last = useRef(performance.now());

  useFrame(() => {
    frames.current += 1;
    const now = performance.now();
    const elapsed = now - last.current;
    if (elapsed >= 500) {
      onFps(Math.round((frames.current * 1000) / elapsed));
      frames.current = 0;
      last.current = now;
    }
  });

  return null;
}
