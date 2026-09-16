/*
 * 将真实 Agent 增量写入当前等待中的助手消息。
 * Created on 2026-09-14
 * @author: https://github.com/Linmoqian
 */

import { useCallback, useEffect, useRef } from 'react';

import type { Dispatch, SetStateAction } from 'react';
import type { WorkspaceSnapshot } from '../types';

export type AgentReplyDelta = {
  requestId: string;
  conversationId: string;
  kind: 'thinking' | 'text';
  delta: string;
};

export default function useReplyStream(
  setSnapshot: Dispatch<SetStateAction<WorkspaceSnapshot | null>>,
) {
  const queue = useRef<AgentReplyDelta[]>([]);
  const frame = useRef<number | null>(null);

  const flush = useCallback(() => {
    frame.current = null;
    const deltas = queue.current;
    queue.current = [];
    if (!deltas.length) return;

    setSnapshot((current) => {
      if (!current) return current;
      const relevant = deltas.filter(
        (delta) => delta.conversationId === current.conversation.id,
      );
      if (!relevant.length) return current;
      let messageIndex = -1;
      for (let index = current.messages.length - 1; index >= 0; index -= 1) {
        const message = current.messages[index];
        if (
          message.role === 'assistant' &&
          message.status &&
          relevant.some((delta) => delta.requestId === message.requestId)
        ) {
          messageIndex = index;
          break;
        }
      }
      if (messageIndex < 0) return current;
      const messages = [...current.messages];
      const message = messages[messageIndex];
      let content = message.content;
      let reasoning = message.reasoning ?? '';
      for (const delta of relevant) {
        if (delta.kind === 'text') content += delta.delta;
        else reasoning += delta.delta;
      }
      messages[messageIndex] = {
        ...message,
        status: 'streaming',
        content,
        reasoning,
      };
      return { ...current, messages };
    });
  }, [setSnapshot]);

  useEffect(
    () => () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      queue.current = [];
    },
    [],
  );

  return useCallback((delta: AgentReplyDelta) => {
    queue.current.push(delta);
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(flush);
  }, [flush]);
}
