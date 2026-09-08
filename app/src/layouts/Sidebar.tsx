/*
 * 左侧会话栏(Codex 式):品牌区、新建任务、搜索与按时间分组的会话列表。
 * 宽度 320px 取自 --layout-sidebar;折叠动画由 AppLayout 的 spring 驱动。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import { useMemo, useState } from "react";
import { Button, Input } from "antd";
import { Plus, Search, Sprout } from "lucide-react";
import type { ChatSession } from "../features/chat/types";
import styles from "./Sidebar.module.css";

type SidebarProps = {
  sessions: ChatSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewSession: () => void;
};

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
      <div className={styles.brand}>
        <Sprout size={24} aria-hidden />
        <span className={styles.brandName}>Pod Agent</span>
      </div>

      <Button
        type="primary"
        block
        icon={<Plus size={18} />}
        onClick={onNewSession}
      >
        新建任务
      </Button>

      <Input
        allowClear
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder="搜索任务"
        prefix={<Search size={16} aria-hidden />}
        aria-label="搜索任务"
      />

      <nav className={styles.sessionNav} aria-label="会话列表">
        {groups.map(([group, groupSessions]) => (
          <section key={group} className={styles.group}>
            <h3 className={styles.groupLabel}>{group}</h3>
            <ul className={styles.groupList}>
              {groupSessions.map((session) => {
                const active = session.id === activeId;
                return (
                  <li key={session.id}>
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
                        <span className={styles.sessionTitle}>
                          {session.title}
                        </span>
                        <span className={styles.sessionMeta}>
                          {session.messages.length} 条消息
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
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
