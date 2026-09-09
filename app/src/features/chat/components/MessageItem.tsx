/*
 * 单条消息:用户侧为右对齐气泡,助手侧为全宽 Markdown 内容。
 * 入场使用苹果式 spring,尊重系统"减少动态效果"。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import { motion, useReducedMotion } from "motion/react";
import AppIcon from "../../../components/common/AppIcon";
import MarkdownContent from "./MarkdownContent";
import type { ChatMessage } from "../types";
import { REDUCED_MOTION_TRANSITION, SPRING_STANDARD } from "../../../utils/motion";
import styles from "./MessageItem.module.css";

function MessageItem({ message }: { message: ChatMessage }) {
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion ? REDUCED_MOTION_TRANSITION : SPRING_STANDARD;

  if (message.role === "user") {
    return (
      <motion.div
        className={styles.userRow}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={transition}
      >
        <div className={styles.userBubble}>{message.content}</div>
        <span className={styles.meta}>你 · {message.time}</span>
      </motion.div>
    );
  }

  return (
    <motion.section
      className={styles.assistantRow}
      aria-label="Pod Agent 回复"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition}
    >
      <span className={styles.assistantName}>
        <AppIcon name="brand-sprout" size={15} />
        Pod Agent · {message.time}
      </span>
      <MarkdownContent content={message.content} />
    </motion.section>
  );
}

export default MessageItem;
