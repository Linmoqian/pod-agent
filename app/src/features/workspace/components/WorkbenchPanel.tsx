/*
 * lian 右侧育种台的常驻任务与可管理任务标签面板。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import type { TaskPlan, WorkflowRun, WorkspaceSnapshot } from '../types';
import TaskPlanPanel from './TaskPlanPanel';
import WorkbenchFileTree from './WorkbenchFileTree';
import styles from './WorkbenchPanel.module.css';
import WorkbenchTabBar from './WorkbenchTabBar';
import useWorkbenchTabs from './useWorkbenchTabs';

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
  const { snapshot, latestPlan, latestRun, activeRunId, embedded } = props;
  const reduced = useReducedMotion();
  const {
    activeTabId,
    addTab,
    closeTab,
    setActiveTabId,
    setViewMenuOpen,
    tabBarRef,
    tabs,
    viewMenuOpen,
  } = useWorkbenchTabs(latestPlan);
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
      <WorkbenchTabBar
        activeTabId={activeTabId}
        onAdd={addTab}
        onClose={closeTab}
        onSelect={setActiveTabId}
        onToggleMenu={() => setViewMenuOpen((value) => !value)}
        tabBarRef={tabBarRef}
        tabs={tabs}
        viewMenuOpen={viewMenuOpen}
      />
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={activeTabId}
          className={styles.tabContent}
          initial={reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -2 }}
          transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
        >
          {tabs.find((tab) => tab.id === activeTabId)?.kind === 'files' ? (
            <WorkbenchFileTree />
          ) : (
            task
          )}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}
