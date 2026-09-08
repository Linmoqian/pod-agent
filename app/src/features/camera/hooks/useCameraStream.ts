/*
 * 摄像头流生命周期:模态打开时请求 getUserMedia,关闭或竞态时停止全部轨道。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import { useEffect, useRef, useState } from "react";
import { toCameraPhase, type CameraPhase } from "../components/cameraErrors";

function useCameraStream(open: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<CameraPhase>("loading");

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let cancelled = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("unsupported");
      return;
    }

    setPhase("loading");
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((mediaStream) => {
        // 模态已关闭时立即释放,避免摄像头指示灯滞留
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
        setPhase("preview");
      })
      .catch((error: unknown) => setPhase(toCameraPhase(error)));

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open]);

  return { videoRef, phase };
}

export default useCameraStream;
