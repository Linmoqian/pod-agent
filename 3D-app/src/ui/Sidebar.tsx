// 左侧控制面板：文件加载、着色模式、点大小、显示开关、背景、Reset

import type { ColorMode } from "../core/types";
import type { ExampleEntry } from "../core/examples";
import styles from "./ui.module.css";

export const DEMO_LABEL = "示例 · 模拟大豆";

export const BG_PRESETS = [
  { name: "深空", bg: "#101014", grid: "#33333d", section: "#4d4d5c" },
  { name: "纯黑", bg: "#000000", grid: "#2a2a2a", section: "#404040" },
  { name: "浅灰", bg: "#e8eaee", grid: "#c2c6cf", section: "#9aa0ad" },
] as const;

const MODE_LABELS: Record<ColorMode, string> = {
  rgb: "RGB 真彩",
  height: "高度渐变",
  intensity: "反射强度",
  uniform: "纯色",
};

interface Props {
  loading: boolean;
  hasCloud: boolean;
  colorMode: ColorMode;
  availableModes: ColorMode[];
  onColorMode: (m: ColorMode) => void;
  sizeScale: number;
  onSizeScale: (v: number) => void;
  showPoints: boolean;
  showGrid: boolean;
  showAxes: boolean;
  onToggle: (key: "points" | "grid" | "axes", v: boolean) => void;
  bgIndex: number;
  onBg: (i: number) => void;
  onFile: (f: File) => void;
  onDemo: () => void;
  examples: ExampleEntry[];
  activeLabel: string | null;
  onExample: (e: ExampleEntry) => void;
  onReset: () => void;
}

export function Sidebar(props: Props) {
  return (
    <aside className={styles.sidebar}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>示例</h3>
        <button
          className={`${styles.button} ${props.activeLabel === DEMO_LABEL ? styles.active : ""}`}
          disabled={props.loading}
          onClick={props.onDemo}
        >
          模拟大豆
          <span className={styles.buttonHint}>程序生成 · 600k</span>
        </button>
        {props.examples.map((ex) => (
          <button
            key={ex.id}
            className={`${styles.button} ${props.activeLabel === ex.label ? styles.active : ""}`}
            disabled={props.loading}
            onClick={() => props.onExample(ex)}
          >
            {ex.label}
            <span className={styles.buttonHint}>{ex.detail}</span>
          </button>
        ))}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>着色</h3>
        {(Object.keys(MODE_LABELS) as ColorMode[]).map((mode) => {
          const enabled = props.availableModes.includes(mode);
          return (
            <label
              key={mode}
              className={`${styles.radioRow} ${enabled ? "" : styles.disabled}`}
            >
              <input
                type="radio"
                name="colorMode"
                disabled={!enabled || props.loading}
                checked={props.colorMode === mode}
                onChange={() => props.onColorMode(mode)}
              />
              {MODE_LABELS[mode]}
            </label>
          );
        })}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          点大小 <span className={styles.badge}>×{props.sizeScale.toFixed(2)}</span>
        </h3>
        <input
          type="range"
          min={0.1}
          max={6}
          step={0.05}
          value={props.sizeScale}
          onChange={(e) => props.onSizeScale(Number(e.target.value))}
        />
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>显示</h3>
        <label className={styles.radioRow}>
          <input
            type="checkbox"
            checked={props.showPoints}
            onChange={(e) => props.onToggle("points", e.target.checked)}
          />
          点云
        </label>
        <label className={styles.radioRow}>
          <input
            type="checkbox"
            checked={props.showGrid}
            onChange={(e) => props.onToggle("grid", e.target.checked)}
          />
          网格
        </label>
        <label className={styles.radioRow}>
          <input
            type="checkbox"
            checked={props.showAxes}
            onChange={(e) => props.onToggle("axes", e.target.checked)}
          />
          坐标轴
        </label>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>数据</h3>
        <label className={`${styles.button} ${props.loading ? styles.disabled : ""}`}>
          打开 PLY / PCD
          <input
            type="file"
            accept=".ply,.pcd"
            disabled={props.loading}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) props.onFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>背景</h3>
        <div className={styles.swatchRow}>
          {BG_PRESETS.map((p, i) => (
            <button
              key={p.name}
              title={p.name}
              className={`${styles.swatch} ${props.bgIndex === i ? styles.swatchActive : ""}`}
              style={{ background: p.bg }}
              onClick={() => props.onBg(i)}
            />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <button
          className={`${styles.button} ${styles.primary}`}
          disabled={!props.hasCloud}
          onClick={props.onReset}
        >
          Reset View
        </button>
      </section>
    </aside>
  );
}
