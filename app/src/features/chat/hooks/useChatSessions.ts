/*
 * 会话状态 hook:持有会话列表与选中项,提供发送消息与新建任务。
 * 从 AppLayout 拆出,保持布局组件专注组装与动画编排。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import { useCallback, useState } from "react";
import { MOCK_SESSIONS, PLACEHOLDER_REPLY } from "../data/mockSessions";
import type { ChatMessage, ChatSession } from "../types";

let idSeq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${idSeq++}`;

function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>(MOCK_SESSIONS);
  const [activeId, setActiveId] = useState<string | null>(
    MOCK_SESSIONS[0]?.id ?? null,
  );

  const activeSession =
    sessions.find((session) => session.id === activeId) ?? null;

  const appendMessages = useCallback(
    (sessionId: string, messages: ChatMessage[]) => {
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                // 首条消息即会话标题,与 Codex 的任务命名习惯一致
                title:
                  session.messages.length === 0
                    ? messages[0].content.slice(0, 20)
                    : session.title,
                messages: [...session.messages, ...messages],
              }
            : session,
        ),
      );
    },
    [],
  );

  const sendMessage = useCallback(
    (text: string) => {
      const userMessage: ChatMessage = {
        id: nextId("msg"),
        role: "user",
        content: text,
        time: "刚刚",
      };
      // 占位回复:真实 Agent 链路接入前的诚实文案
      const reply: ChatMessage = {
        id: nextId("msg"),
        role: "assistant",
        content: PLACEHOLDER_REPLY,
        time: "刚刚",
      };

      if (activeSession) {
        appendMessages(activeSession.id, [userMessage, reply]);
        return;
      }

      // 无选中会话时从欢迎页创建新任务
      const session: ChatSession = {
        id: nextId("session"),
        title: text.slice(0, 20),
        status: "working",
        group: "今天",
        messages: [userMessage, reply],
      };
      setSessions((prev) => [session, ...prev]);
      setActiveId(session.id);
    },
    [activeSession, appendMessages],
  );

  const createSession = useCallback(() => {
    // 再次点击视为放弃当前草稿,回到空状态欢迎页
    setActiveId(null);
  }, []);

  return {
    sessions,
    activeSession,
    setActiveId,
    sendMessage,
    createSession,
  };
}

export default useChatSessions;
