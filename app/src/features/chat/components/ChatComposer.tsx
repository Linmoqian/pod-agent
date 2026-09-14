/*
 * 消息输入器(Codex 式 composer):无边框文本域内嵌白底卡片。
 * 聚焦态遵循 Token 9.5:品牌绿边框 + focus-ring 外环。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import { useState } from "react";
import { SendHorizontal } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import styles from "./ChatComposer.module.css";

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

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className={styles.composer}>
      <div className={styles.inputCard}>
        {/* field-sizing 自动高度;不支持时退化为固定一行 */}
        <Textarea
          value={value}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className={`${styles.messageInput} field-sizing-content max-h-24 min-h-0 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0`}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          aria-label="消息输入"
        />
        <Button
          size="icon"
          aria-label="发送"
          className={`${styles.sendButton} size-10 shrink-0 rounded-full`}
          disabled={!value.trim()}
          onClick={submit}
        >
          <SendHorizontal size={17} strokeWidth={1.75} />
        </Button>
      </div>
      <p className={styles.hint}>Enter 发送 · Shift+Enter 换行</p>
    </div>
  );
}

export default ChatComposer;
