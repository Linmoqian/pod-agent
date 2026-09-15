/* 育种台通用任务列表，统一展示任务状态、进度与耗时。
 * Created on 2026-09-15
 * @author: https://github.com/Linmoqian
 */

import { ClipboardList } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { WorkbenchTask } from '../workbenchTasks';
import styles from './WorkbenchPanel.module.css';

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function WorkbenchTaskList({
  tasks,
}: {
  tasks: readonly WorkbenchTask[];
}) {
  const [now, setNow] = useState(() => Date.now());
  const hasRunningTask = tasks.some((task) => task.status === 'running');

  useEffect(() => {
    if (!hasRunningTask) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasRunningTask]);

  return (
    <div className={styles.taskList} role="list" aria-label="任务列表">
      {tasks.map((task) => (
        <article
          key={`${task.kind}:${task.id}`}
          className={styles.workbenchTask}
          data-complete={task.isComplete}
          data-status={task.status}
          role="listitem"
        >
          <header className={styles.workbenchTaskHeader}>
            <div className={styles.workbenchTaskTitle}>
              <span className={styles.workbenchTaskIcon}>
                <ClipboardList size={14} aria-hidden />
              </span>
              <div>
                <strong>{task.title}</strong>
                <small>{task.summary}</small>
              </div>
            </div>
            <time
              dateTime={task.startedAt ? new Date(task.startedAt).toISOString() : undefined}
            >
              {task.startedAt ? `运行 ${formatDuration(task.elapsedMilliseconds(now))}` : '待开始'}
            </time>
          </header>
          <progress
            className={styles.workbenchTaskProgress}
            max={1}
            value={task.progress ?? undefined}
            aria-label={`${task.title}进度`}
            aria-valuetext={task.progressLabel}
          />
          <footer className={styles.workbenchTaskFooter}>
            <span>{task.progressLabel}</span>
            <span data-status={task.status}>{task.statusLabel}</span>
          </footer>
        </article>
      ))}
    </div>
  );
}
