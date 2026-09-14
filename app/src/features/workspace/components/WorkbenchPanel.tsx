/*
 * lian 右侧育种台的常驻任务与可管理任务标签面板。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { Plus, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';

import type { TaskPlan, WorkflowRun, WorkspaceSnapshot } from '../types';
import TaskPlanPanel from './TaskPlanPanel';
import styles from './WorkbenchPanel.module.css';

type WorkbenchTab = {
  id: string;
  label: string;
  pinned?: boolean;
};

export type WorkbenchPanelProps = {
  snapshot: WorkspaceSnapshot;
  latestPlan?: TaskPlan;
  latestRun?: WorkflowRun;
  activeRunId: string | null;
  busy: boolean;
  onConfirm: (planId: string) => void;
  onCancel: (runId: string) => void;
  embedded?: boolean;
};

function EmptyHint({ description }: { description: string }) {
  return <p className={styles.empty}>{description}</p>;
}

export default function WorkbenchPanel(props: WorkbenchPanelProps) {
  const {
    snapshot,
    latestPlan,
    latestRun,
    activeRunId,
    embedded,
  } = props;
  const [tabs, setTabs] = useState<WorkbenchTab[]>([
    { id: 'task', label: '任务', pinned: true },
  ]);
  const [activeTabId, setActiveTabId] = useState('task');
  const reduced = useReducedMotion();
  const runningId =
    activeRunId ?? (latestRun?.status === 'running' ? latestRun.id : null);
  const task = latestPlan ? (
    <TaskPlanPanel
      plan={latestPlan}
      run={latestRun}
      runningId={runningId}
      busy={props.busy}
      onConfirm={props.onConfirm}
      onCancel={props.onCancel}
    />
  ) : (
    <EmptyHint description="提出问题后，任务计划会出现在这里" />
  );
  const addTab = () => {
    const id = `task-${Date.now()}`;
    setTabs((current) => [
      ...current,
      { id, label: latestPlan?.title || `任务 ${current.length}` },
    ]);
    setActiveTabId(id);
  };
  const closeTab = (tabId: string) => {
    const index = tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0 || tabs[index].pinned) return;
    const next = tabs.filter((tab) => tab.id !== tabId);
    setTabs(next);
    if (tabId === activeTabId) {
      setActiveTabId(next[index]?.id ?? next[index - 1]?.id ?? 'task');
    }
  };
  return (
    <aside className={`${styles.panel} ${embedded ? styles.embedded : ''}`}>
      <div className={styles.title}>
        <b>育种台</b>
        <span>
          {snapshot.overview
            ? `${snapshot.overview.materialCount} 材料 · ${snapshot.overview.executionCount} 次执行`
          : '等待任务'}
        </span>
      </div>
      <div className={styles.tabBar} role="tablist" aria-label="育种台任务标签">
        <div className={styles.tabList}>
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            return (
              <motion.div
                key={tab.id}
                layout="position"
                className={styles.tab}
                data-active={active ? 'true' : undefined}
                transition={{ type: 'spring', stiffness: 460, damping: 36, mass: 0.7 }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={styles.tabLabel}
                  onClick={() => setActiveTabId(tab.id)}
                >
                  <span>{tab.label}</span>
                </button>
                {!tab.pinned && (
                  <button
                    type="button"
                    className={styles.closeTab}
                    aria-label={`关闭${tab.label}`}
                    onClick={() => closeTab(tab.id)}
                  >
                    <X size={13} />
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
        <button
          type="button"
          className={styles.newTab}
          aria-label="新建育种台任务标签"
          title="新建任务标签"
          onClick={addTab}
        >
          <Plus size={16} />
        </button>
      </div>
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={activeTabId}
          className={styles.tabContent}
          initial={reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -2 }}
          transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
        >
          {task}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}
