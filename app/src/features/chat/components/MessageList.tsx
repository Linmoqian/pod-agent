/*
 * 消息流:滚动容器 + 阅读宽度容器,新消息与流式增量时即时跟随到底部。
 * Created on 2026-09-08
 * Updated on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { useEffect, useRef } from "react";
import MessageItem from "./MessageItem";
import type { ChatSession } from "../types";
import styles from "./MessageList.module.css";

function MessageList({ session }: { session: ChatSession }) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastMessage = session.messages[session.messages.length - 1];

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: "auto",
      block: "end",
    });
    // 依赖最后一条消息长度:流式增量到达时跟随滚动
  }, [session.messages.length, lastMessage?.content.length]);

  return (
    <div className={styles.scrollArea}>
      <div className={styles.messageList} role="log" aria-label="对话消息">
        {session.messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}
        <div ref={endRef} aria-hidden />
      </div>
    </div>
  );
}

export default MessageList;
