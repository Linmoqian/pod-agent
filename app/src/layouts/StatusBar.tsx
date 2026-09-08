/*
 * 底部状态栏(参考 X-line StatusBar 布局):品牌名、会话概览与运行环境。
 * 当前模型信息由主区顶栏承载,此处不重复;高度 28px 毛玻璃浮于底部。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import type { ChatSession } from "../features/chat/types";
import styles from "./StatusBar.module.css";

type StatusBarProps = {
  session: ChatSession | null;
  sessionCount: number;
};

function StatusBar({ session, sessionCount }: StatusBarProps) {
  const messageCount = session?.messages.length ?? 0;

  return (
    <footer className={styles.statusBar}>
      <div className={styles.leftGroup}>
        <span className={styles.brand}>Pod Agent</span>
        <span className={styles.divider} aria-hidden />
        <span className={styles.metric}>{sessionCount} 个会话</span>
        {session && (
          <>
            <span className={styles.divider} aria-hidden />
            <span className={styles.metric} data-status={session.status}>
              {session.status === "working" ? "任务进行中" : "已就绪"} ·{" "}
              {messageCount} 条消息
            </span>
          </>
        )}
      </div>
      <span className={styles.env}>本地会话</span>
    </footer>
  );
}

export default StatusBar;
