/*
 * 相机模态:getUserMedia 实时预览 + 本地拍照,不依赖原生层与网络上传。
 * 权限拒绝、设备缺失、环境不支持均映射为可读错误文案;关闭即释放摄像头。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import { useEffect, useState, type ReactNode } from "react";
import { Button, Modal } from "antd";
import AppIcon from "../../../components/common/AppIcon";
import useCameraStream from "../hooks/useCameraStream";
import { CAMERA_ERROR_TEXT, type CameraPhase } from "./cameraErrors";
import styles from "./CameraModal.module.css";

/* 取景区内的加载/错误覆盖层,两处结构相同故合并 */
function CameraStatePanel({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className={styles.statePanel} role="status">
      {icon}
      <p>{text}</p>
    </div>
  );
}

type CameraModalProps = {
  open: boolean;
  onClose: () => void;
};

function CameraModal({ open, onClose }: CameraModalProps) {
  const { videoRef, phase } = useCameraStream(open);
  const [photo, setPhoto] = useState<string | null>(null);

  // 重开模态时清掉上一次的拍摄结果
  useEffect(() => {
    if (open) setPhoto(null);
  }, [open]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setPhoto(canvas.toDataURL("image/jpeg"));
  };

  const errorText =
    phase === "preview" || phase === "loading"
      ? null
      : CAMERA_ERROR_TEXT[phase as Exclude<CameraPhase, "preview" | "loading">];

  return (
    <Modal
      title="相机"
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={520}
      rootClassName={styles.modalRoot}
    >
      <div className={styles.body}>
        <div className={styles.viewport}>
          {/* 拍照预览期间隐藏而非卸载 video,保证"重拍"时流仍接在同一元素上 */}
          <video
            ref={videoRef}
            className={photo ? styles.hidden : styles.video}
            autoPlay
            playsInline
            muted
          />
          {photo && <img src={photo} alt="拍摄照片" className={styles.photo} />}
          {errorText && (
            <CameraStatePanel
              icon={<AppIcon name="camera-off" size={28} />}
              text={errorText}
            />
          )}
          {phase === "loading" && !photo && (
            <CameraStatePanel
              icon={<span className={styles.loader} aria-hidden />}
              text="正在打开相机…"
            />
          )}
        </div>

        <p className={styles.hint}>照片仅本地预览,不会上传。</p>

        <div className={styles.actions}>
          {photo ? (
            <Button
              icon={<AppIcon name="retry" size={16} />}
              onClick={() => setPhoto(null)}
            >
              重拍
            </Button>
          ) : (
            <Button
              type="primary"
              shape="circle"
              size="large"
              aria-label="拍照"
              icon={<AppIcon name="camera" size={20} />}
              disabled={phase !== "preview"}
              onClick={capture}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

export default CameraModal;
