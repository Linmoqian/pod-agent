// 顶栏（文件名/点数/FPS）与底栏（target 坐标、着色模式、操作提示）

import type { ColorMode } from "../core/types";
import styles from "./ui.module.css";

const MODE_LABELS: Record<ColorMode, string> = {
  rgb: "RGB",
  height: "高度",
  intensity: "强度",
  uniform: "纯色",
};

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function TopBar(props: {
  fileName: string | null;
  pointCount: number;
  fps: number;
  loading: boolean;
}) {
  const fpsClass =
    props.fps >= 50 ? styles.good : props.fps >= 30 ? styles.mid : styles.bad;
  return (
    <header className={styles.topBar}>
      <div className={styles.brand}>大豆点云 Viewer</div>
      <div className={styles.topMeta}>
        <span className={styles.fileName}>
          {props.fileName ?? "未加载点云"}
        </span>
        <span className={styles.metric}>
          点数 <b>{formatCount(props.pointCount)}</b>
        </span>
        <span className={styles.metric}>
          FPS <b className={fpsClass}>{props.fps}</b>
        </span>
        {props.loading && <span className={styles.loading}>解析中…</span>}
      </div>
    </header>
  );
}

export function StatusBar(props: {
  target: [number, number, number];
  colorMode: ColorMode;
}) {
  const [x, y, z] = props.target;
  return (
    <footer className={styles.statusBar}>
      <span className={styles.coords}>
        X {x.toFixed(3)}&nbsp;&nbsp;Y {y.toFixed(3)}&nbsp;&nbsp;Z {z.toFixed(3)}
      </span>
      <span className={styles.hint}>
        着色: {MODE_LABELS[props.colorMode]} · 左键旋转 · 滚轮缩放 · 右键平移
      </span>
    </footer>
  );
}
