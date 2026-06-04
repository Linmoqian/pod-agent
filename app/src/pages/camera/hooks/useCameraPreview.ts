import { useRef, useEffect, useCallback } from "react";
import { useCameraStore } from "../../../store";

export function useCameraPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { loadDevices, startPreview, stopPreview, loadLastPhoto, isStreaming } = useCameraStore();

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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await loadDevices();
      loadLastPhoto();
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

  return { canvasRef, isStreaming };
}
