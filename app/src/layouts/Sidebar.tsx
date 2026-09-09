/*
 * 会话面板(参考 X-line route-panel 职责):新建任务、搜索与按时间分组的会话列表。
 * 品牌区、相机与设置入口已迁移至 IconRail;折叠与拖宽由 AppLayout 的面板容器驱动。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import { useMemo, useState } from "react";
import { Button, Input } from "antd";
import AppIcon from "../components/common/AppIcon";
import type { ChatSession } from "../features/chat/types";
import styles from "./Sidebar.module.css";

type SidebarProps = {
  sessions: ChatSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewSession: () => void;
};

/* 单个会话项:选中态走品牌绿淡底 + 2px 指示条 */
function SessionItem({
  session,
  active,
  onSelect,
}: {
  session: ChatSession;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={styles.sessionItem}
        aria-current={active ? "true" : undefined}
        data-active={active}
        onClick={() => onSelect(session.id)}
      >
        <span
          className={styles.statusDot}
          data-status={session.status}
          aria-hidden
        />
        <span className={styles.sessionText}>
          <span className={styles.sessionTitle}>{session.title}</span>
          <span className={styles.sessionMeta}>
            {session.messages.length} 条消息
          </span>
        </span>
      </button>
    </li>
  );
}

function Sidebar({
  sessions,
  activeId,
  onSelect,
  onNewSession,
}: SidebarProps) {
  const [keyword, setKeyword] = useState("");

  const groups = useMemo(() => {
    const filtered = sessions.filter((session) =>
      session.title.includes(keyword.trim()),
    );
    const grouped = new Map<string, ChatSession[]>();
    for (const session of filtered) {
      grouped.set(session.group, [...(grouped.get(session.group) ?? []), session]);
    }
    return [...grouped.entries()];
  }, [sessions, keyword]);

  return (
    <div className={styles.sidebarInner}>
      <header className={styles.sidebarHeader}>
        <p className={styles.eyebrow}>会话工作台</p>
        <h2 className={styles.sidebarTitle}>育种任务</h2>
        <p className={styles.sidebarDescription}>
          将品种性状、田间观察和育种决策整理为连续会话。
        </p>
      </header>

      <Button
        type="primary"
        block
        icon={<AppIcon name="add" size={17} />}
        onClick={onNewSession}
      >
        新建任务
      </Button>

      <Input
        allowClear
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder="搜索任务"
        prefix={<AppIcon name="search" size={16} />}
        aria-label="搜索任务"
      />

      <nav className={styles.sessionNav} aria-label="会话列表">
        {groups.map(([group, groupSessions]) => (
          <section key={group} className={styles.group}>
            <h3 className={styles.groupLabel}>{group}</h3>
            <ul className={styles.groupList}>
              {groupSessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  active={session.id === activeId}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          </section>
        ))}
        {groups.length === 0 && (
          <p className={styles.emptyTip}>没有匹配的任务</p>
        )}
      </nav>
    </div>
  );
}

export default Sidebar;
