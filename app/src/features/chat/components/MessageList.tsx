/*
 * 消息流:滚动容器 + 阅读宽度容器,新消息时平滑滚动到底部。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import MessageItem from "./MessageItem";
import type { ChatSession } from "../types";
import styles from "./MessageList.module.css";

function MessageList({ session }: { session: ChatSession }) {
  const endRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [session.messages.length, reduceMotion]);

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
