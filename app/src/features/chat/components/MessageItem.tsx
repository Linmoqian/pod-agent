/*
 * 单条消息:用户侧为右对齐气泡,助手侧为全宽 Markdown 内容。
 * 会话切换由上层容器处理;历史消息直接绘制,避免逐条从下方登场。
 * Created on 2026-09-08
 * Updated on 2026-09-13
 * @author: https://github.com/Linmoqian
 */

import BrandMark from "../../../components/common/BrandMark";
import MarkdownContent from "../../../components/common/MarkdownContent";
import type { ChatMessage } from "../types";
import styles from "./MessageItem.module.css";

function MessageItem({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className={styles.userRow}>
        <div className={styles.userBubble}>{message.content}</div>
        <span className={styles.meta}>你 · {message.time}</span>
      </div>
    );
  }

  return (
    <section className={styles.assistantRow} aria-label="Pod Agent 回复">
      <span className={styles.assistantName}>
        <BrandMark size={18} />
        Pod Agent · {message.time}
      </span>
      <MarkdownContent content={message.content} />
    </section>
  );
}

export default MessageItem;
