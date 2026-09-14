/*
 * 将真实 Agent 增量写入当前等待中的助手消息。
 * Created on 2026-09-14
 * @author: https://github.com/Linmoqian
 */

import { useCallback } from 'react';

import type { Dispatch, SetStateAction } from 'react';
import type { WorkspaceSnapshot } from '../types';

export type AgentReplyDelta = {
  conversationId: string;
  kind: 'thinking' | 'text';
  delta: string;
};

export default function useReplyStream(
  setSnapshot: Dispatch<SetStateAction<WorkspaceSnapshot | null>>,
) {
  return useCallback(
    (delta: AgentReplyDelta) => {
      setSnapshot((current) => {
        if (current?.conversation.id !== delta.conversationId) return current;
        let messageIndex = -1;
        for (let index = current.messages.length - 1; index >= 0; index -= 1) {
          const message = current.messages[index];
          if (message.role === 'assistant' && message.status) {
            messageIndex = index;
            break;
          }
        }
        if (messageIndex < 0) return current;
        const messages = [...current.messages];
        const message = messages[messageIndex];
        messages[messageIndex] = {
          ...message,
          status: 'streaming',
          content:
            delta.kind === 'text'
              ? `${message.content}${delta.delta}`
              : message.content,
          reasoning:
            delta.kind === 'thinking'
              ? `${message.reasoning ?? ''}${delta.delta}`
              : message.reasoning,
        };
        return { ...current, messages };
      });
    },
    [setSnapshot],
  );
}
