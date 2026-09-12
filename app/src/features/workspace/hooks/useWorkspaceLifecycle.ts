/*
 * 订阅生命周期事件并以持久化快照恢复前端状态。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';

import type { LifecycleEvent } from '../types';

export default function useWorkspaceLifecycle(
  projectId: string | undefined,
  refresh: (projectId: string) => Promise<void>,
  setActiveRunId: (runId: string | null) => void,
) {
  useEffect(() => {
    if (!projectId) return undefined;
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    const bind = async () => {
      for (const eventName of [
        'lian-import-event',
        'lian-agent-event',
        'lian-workflow-event',
      ]) {
        const unlisten = await listen<LifecycleEvent>(eventName, (event) => {
          const lifecycle = event.payload;
          if (lifecycle.eventType === 'workflow.started') {
            setActiveRunId(lifecycle.runId);
          } else if (
            [
              'workflow.succeeded',
              'workflow.failed',
              'workflow.cancelled',
            ].includes(lifecycle.eventType)
          ) {
            setActiveRunId(null);
          }
          if (lifecycle.projectId === projectId) void refresh(projectId);
        });
        if (disposed) unlisten();
        else unlisteners.push(unlisten);
      }
    };
    void bind();
    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [projectId, refresh, setActiveRunId]);
}
