/*
 * 订阅生命周期事件并以会话上下文恢复前端状态。
 * Created on 2026-09-12
 * Updated on 2026-09-14
 * @author: https://github.com/Linmoqian
 */

import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';

import type { LifecycleEvent } from '../types';
import type { AgentReplyDelta } from './useReplyStream';

type AgentReplyDeltaEvent = AgentReplyDelta & {
  eventType: 'agent.reply.delta';
};

function isAgentReplyDelta(value: unknown): value is AgentReplyDeltaEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'eventType' in value &&
    value.eventType === 'agent.reply.delta' &&
    'conversationId' in value &&
    typeof value.conversationId === 'string' &&
    'kind' in value &&
    (value.kind === 'thinking' || value.kind === 'text') &&
    'delta' in value &&
    typeof value.delta === 'string'
  );
}

export default function useWorkspaceLifecycle(
  projectId: string | undefined,
  conversationId: string | undefined,
  refresh: (conversationId: string) => Promise<void>,
  setActiveRunId: (runId: string | null) => void,
  onReplyDelta: (delta: AgentReplyDelta) => void,
) {
  useEffect(() => {
    if (!conversationId) return undefined;
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    const bind = async () => {
      for (const eventName of [
        'lian-import-event',
        'lian-agent-event',
        'lian-workflow-event',
      ]) {
        const unlisten = await listen<LifecycleEvent>(eventName, (event) => {
          if (isAgentReplyDelta(event.payload)) {
            if (event.payload.conversationId === conversationId) {
              onReplyDelta(event.payload);
            }
            return;
          }
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
          // 计划/导入/运行事件只会在项目上下文产生，按项目归属过滤。
          if (projectId && lifecycle.projectId === projectId) {
            void refresh(conversationId);
          }
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
  }, [projectId, conversationId, refresh, setActiveRunId, onReplyDelta]);
}
