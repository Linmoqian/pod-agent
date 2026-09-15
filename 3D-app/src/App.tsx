// 应用编排：持有 Viewer 全部 UI 状态，连接数据层与渲染层

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColorMode, PointCloudData } from "./core/types";
import { loadPointCloud } from "./core/loaders";
import { generateSoybeanDemo } from "./core/demo-soybean";
import { boundsRadius } from "./core/bounds";
import { Viewer } from "./viewer/Viewer";
import { BG_PRESETS, Sidebar } from "./ui/Sidebar";
import { StatusBar, TopBar } from "./ui/Hud";
import styles from "./ui/ui.module.css";

type ToggleKey = "points" | "grid" | "axes";

export default function App() {
  const [data, setData] = useState<PointCloudData | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [colorMode, setColorMode] = useState<ColorMode>("rgb");
  const [sizeScale, setSizeScale] = useState(1);
  const [showPoints, setShowPoints] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [bgIndex, setBgIndex] = useState(0);
  const [fitNonce, setFitNonce] = useState(0);

  const [fps, setFps] = useState(0);
  const [target, setTarget] = useState<[number, number, number]>([0, 0, 0]);

  // URL ?mode=height|rgb|intensity|uniform 强制指定着色模式（调试/截图直达）
  const autoMode = useMemo(() => {
    const m = new URLSearchParams(window.location.search).get("mode");
    return m === "rgb" || m === "height" || m === "intensity" || m === "uniform"
      ? m
      : null;
  }, []);

  // 数据可用时按数据内容挑默认着色模式
  const applyData = useCallback(
    (d: PointCloudData, name: string) => {
      setData(d);
      setFileName(name);
      setColorMode(autoMode ?? (d.colors ? "rgb" : d.intensity ? "intensity" : "height"));
      setFitNonce((n) => n + 1);
    },
    [autoMode]
  );

  const handleFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      try {
        const buffer = await file.arrayBuffer();
        // V1 同步解析；大文件卡顿属预期，V2 迁 Worker
        const d = loadPointCloud(buffer, file.name);
        applyData(d, file.name);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [applyData]
  );

  // URL ?src=/ply/xxx.ply 自动加载（dev 调试/截图验证直达）
  const autoSrc = useMemo(
    () => new URLSearchParams(window.location.search).get("src"),
    []
  );
  useEffect(() => {
    if (!autoSrc) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(autoSrc);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        if (cancelled) return;
        const name = autoSrc.split("/").pop() ?? "cloud.ply";
        applyData(loadPointCloud(buffer, name), name);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [autoSrc, applyData]);

  const handleDemo = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      applyData(generateSoybeanDemo(600_000), "示例 · 模拟大豆 (600k)");
    } finally {
      setLoading(false);
    }
  }, [applyData]);

  const handleToggle = useCallback((key: ToggleKey, v: boolean) => {
    if (key === "points") setShowPoints(v);
    else if (key === "grid") setShowGrid(v);
    else setShowAxes(v);
  }, []);

  // 可用着色模式取决于数据属性：height 恒可用，rgb/intensity 需有对应通道
  const availableModes = useMemo<ColorMode[]>(() => {
    const modes: ColorMode[] = ["height"];
    if (data?.colors) modes.unshift("rgb");
    if (data?.intensity) modes.push("intensity");
    return modes;
  }, [data]);

  // 点大小 = 点云尺度基准 × 用户倍率，对不同尺寸的数据均可用
  const pointSize = useMemo(() => {
    const radius = data ? boundsRadius(data.bounds) : 0.35;
    return Math.max(radius * 0.0035, 1e-4) * sizeScale;
  }, [data, sizeScale]);

  const preset = BG_PRESETS[bgIndex];

  return (
    <div className={styles.app}>
      <TopBar
        fileName={fileName}
        pointCount={data?.pointCount ?? 0}
        fps={fps}
        loading={loading}
      />
      <div className={styles.body}>
        <Sidebar
          loading={loading}
          hasCloud={data != null}
          colorMode={colorMode}
          availableModes={availableModes}
          onColorMode={setColorMode}
          sizeScale={sizeScale}
          onSizeScale={setSizeScale}
          showPoints={showPoints}
          showGrid={showGrid}
          showAxes={showAxes}
          onToggle={handleToggle}
          bgIndex={bgIndex}
          onBg={setBgIndex}
          onFile={handleFile}
          onDemo={handleDemo}
          onReset={() => setFitNonce((n) => n + 1)}
        />
        <div className={styles.viewport}>
          <Viewer
            data={data}
            colorMode={colorMode}
            pointSize={pointSize}
            showPoints={showPoints}
            showGrid={showGrid}
            showAxes={showAxes}
            background={preset.bg}
            gridColor={preset.grid}
            sectionColor={preset.section}
            fitNonce={fitNonce}
            onFps={setFps}
            onTarget={setTarget}
          />
          {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}
        </div>
      </div>
      <StatusBar target={target} colorMode={colorMode} />
    </div>
  );
}

function ErrorToast(props: { message: string; onDismiss: () => void }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        maxWidth: "70%",
        padding: "8px 14px",
        borderRadius: 8,
        background: "#3a1a18",
        border: "1px solid #7a352e",
        color: "#f0b0a6",
        fontSize: 12.5,
        display: "flex",
        gap: 12,
        alignItems: "center",
        zIndex: 10,
      }}
    >
      <span>加载失败：{props.message}</span>
      <button
        onClick={props.onDismiss}
        style={{
          background: "none",
          border: "none",
          color: "#f0b0a6",
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        ✕
      </button>
    </div>
  );
}
