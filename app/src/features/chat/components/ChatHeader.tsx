/*
 * 主区顶栏:侧栏开关、当前会话标题与状态、全局操作入口。
 * 样式依据设计 Token"组件配方 9.1":白底、72px、shadow-header。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import { Button, Tooltip } from "antd";
import { PanelLeft, Settings2 } from "lucide-react";
import type { ChatSession } from "../types";
import styles from "./ChatHeader.module.css";

type ChatHeaderProps = {
  session: ChatSession | null;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
};

function ChatHeader({
  session,
  sidebarCollapsed,
  onToggleSidebar,
}: ChatHeaderProps) {
  return (
    <header className={styles.header}>
      <Tooltip title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}>
        <Button
          type="text"
          aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
          icon={<PanelLeft size={20} />}
          onClick={onToggleSidebar}
        />
      </Tooltip>

      <div className={styles.titleGroup}>
        <h2 className={styles.title}>{session ? session.title : "新任务"}</h2>
        {session && (
          <span className={styles.badge} data-status={session.status}>
            <span className={styles.badgeDot} aria-hidden />
            {session.status === "working" ? "进行中" : "已就绪"}
          </span>
        )}
      </div>

      <Tooltip title="设置(占位)">
        <Button
          type="text"
          aria-label="设置"
          icon={<Settings2 size={20} />}
          disabled
        />
      </Tooltip>
    </header>
  );
}

export default ChatHeader;
