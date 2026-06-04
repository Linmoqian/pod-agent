import { useRef, useEffect, useCallback } from "react";
import { Scan } from "lucide-react";
import { useCameraStore } from "../../store";

export default function Viewfinder() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { loadDevices, startPreview, stopPreview, isStreaming } = useCameraStore();

  // 帧渲染回调
  const handleFrame = useCallback((b64: string, width: number, height: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
    };
    img.src = `data:image/jpeg;base64,${b64}`;
  }, []);

  // 生命周期：挂载时启动预览，卸载时停止
  useEffect(() => {
    let cancelled = false;

    (async () => {
      await loadDevices();
      if (!cancelled) {
        await startPreview(null, handleFrame);
      }
    })();

    return () => {
      cancelled = true;
      stopPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex flex-1 items-center justify-center bg-[#1A1A2E]">
      {/* 实时摄像头画面 */}
      <canvas
        ref={canvasRef}
        className={`h-full w-full object-contain ${isStreaming ? "opacity-100" : "opacity-0"}`}
      />

      {/* 未连接时的占位 */}
      {!isStreaming && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-white/40">正在连接摄像头…</p>
        </div>
      )}

      {/* Grid Overlay */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-[380px] w-[500px]">
          <div className="absolute left-[33%] top-0 h-full w-px bg-white/20" />
          <div className="absolute left-[66%] top-0 h-full w-px bg-white/20" />
          <div className="absolute left-0 top-[33%] h-px w-full bg-white/20" />
          <div className="absolute left-0 top-[66%] h-px w-full bg-white/20" />

          {/* Focus Frame */}
          <div className="absolute left-[30%] top-[26%] h-[180px] w-[200px]">
            <div className="absolute left-0 top-0 h-6 w-6 rounded-tl-[6px] border-l-2 border-t-2 border-[#3B82F6]" />
            <div className="absolute right-0 top-0 h-6 w-6 rounded-tr-[6px] border-r-2 border-t-2 border-[#3B82F6]" />
            <div className="absolute bottom-0 left-0 h-6 w-6 rounded-bl-[6px] border-b-2 border-l-2 border-[#3B82F6]" />
            <div className="absolute bottom-0 right-0 h-6 w-6 rounded-br-[6px] border-b-2 border-r-2 border-[#3B82F6]" />
          </div>
        </div>
      </div>

      {/* Focus Label */}
      <div className="pointer-events-none absolute bottom-[42%] flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5">
        <Scan size={14} className="text-[#3B82F6]" />
        <span className="text-[12px] text-white">对准植物叶片</span>
      </div>
    </div>
  );
}
