/*
 * 消息输入器(Codex 式 composer):无边框文本域内嵌白底卡片。
 * 聚焦态遵循 Token 9.5:品牌绿边框 + focus-ring 外环。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import { useState } from "react";
import { Button, Input, Tooltip } from "antd";
import { Camera, SendHorizontal } from "lucide-react";
import CameraModal from "../../camera/components/CameraModal";
import styles from "./ChatComposer.module.css";

const { TextArea } = Input;

type ChatComposerProps = {
  onSend: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

function ChatComposer({
  onSend,
  placeholder = "向 Pod Agent 描述你的育种任务…",
  autoFocus,
}: ChatComposerProps) {
  const [value, setValue] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className={styles.composer}>
      <div className={styles.inputCard}>
        <Tooltip title="打开相机">
          <Button
            type="text"
            shape="circle"
            className={styles.toolButton}
            aria-label="打开相机"
            icon={<Camera size={18} />}
            onClick={() => setCameraOpen(true)}
          />
        </Tooltip>
        <TextArea
          value={value}
          autoFocus={autoFocus}
          placeholder={placeholder}
          variant="borderless"
          autoSize={{ minRows: 1, maxRows: 6 }}
          onChange={(event) => setValue(event.target.value)}
          onPressEnter={(event) => {
            if (!event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          aria-label="消息输入"
        />
        <Button
          type="primary"
          shape="circle"
          aria-label="发送"
          icon={<SendHorizontal size={16} />}
          disabled={!value.trim()}
          onClick={submit}
        />
      </div>
      <p className={styles.hint}>Enter 发送 · Shift+Enter 换行</p>
      <CameraModal open={cameraOpen} onClose={() => setCameraOpen(false)} />
    </div>
  );
}

export default ChatComposer;
