/*
 * 会话状态 hook:持有会话列表与选中项,发送消息经本地 Pi Agent 流式生成回复。
 * 失败与中止以助手消息形式如实呈现。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import { useCallback, useState } from "react";
import { MOCK_SESSIONS } from "../data/mockSessions";
import { streamAgentReply } from "../services/agentClient";
import type { ChatMessage, ChatSession } from "../types";

let idSeq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${idSeq++}`;

/** 追加消息;首条消息即会话标题,与 Codex 的任务命名习惯一致 */
function appendMessagesToSession(
  prev: ChatSession[],
  sessionId: string,
  messages: ChatMessage[],
): ChatSession[] {
  return prev.map((session) =>
    session.id === sessionId
      ? {
          ...session,
          title:
            session.messages.length === 0
              ? messages[0].content.slice(0, 20)
              : session.title,
          messages: [...session.messages, ...messages],
        }
      : session,
  );
}

/** 向指定消息追加流式增量 */
function appendDeltaToSession(
  prev: ChatSession[],
  sessionId: string,
  messageId: string,
  delta: string,
): ChatSession[] {
  return prev.map((session) =>
    session.id === sessionId
      ? {
          ...session,
          messages: session.messages.map((message) =>
            message.id === messageId
              ? { ...message, content: message.content + delta }
              : message,
          ),
        }
      : session,
  );
}

function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>(MOCK_SESSIONS);
  const [activeId, setActiveId] = useState<string | null>(
    MOCK_SESSIONS[0]?.id ?? null,
  );
  const activeSession =
    sessions.find((session) => session.id === activeId) ?? null;

  const appendMessages = useCallback(
    (sessionId: string, messages: ChatMessage[]) =>
      setSessions((prev) => appendMessagesToSession(prev, sessionId, messages)),
    [],
  );

  const appendDelta = useCallback(
    (sessionId: string, messageId: string, delta: string) =>
      setSessions((prev) =>
        appendDeltaToSession(prev, sessionId, messageId, delta),
      ),
    [],
  );

  const generateReply = useCallback(
    async (sessionId: string, history: ChatMessage[]) => {
      const replyId = nextId("msg");
      appendMessages(sessionId, [
        { id: replyId, role: "assistant", content: "", time: "刚刚" },
      ]);

      try {
        await streamAgentReply(history, {
          onDelta: (delta) => appendDelta(sessionId, replyId, delta),
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        appendDelta(sessionId, replyId, `\n\n> 生成失败:${reason}`);
      }
    },
    [appendDelta, appendMessages],
  );

  const sendMessage = useCallback(
    (text: string) => {
      const userMessage: ChatMessage = {
        id: nextId("msg"),
        role: "user",
        content: text,
        time: "刚刚",
      };

      if (activeSession) {
        appendMessages(activeSession.id, [userMessage]);
        void generateReply(activeSession.id, [
          ...activeSession.messages,
          userMessage,
        ]);
        return;
      }

      // 无选中会话时从欢迎页创建新任务
      const session: ChatSession = {
        id: nextId("session"),
        title: text.slice(0, 20),
        status: "working",
        group: "今天",
        messages: [userMessage],
      };
      setSessions((prev) => [session, ...prev]);
      setActiveId(session.id);
      void generateReply(session.id, session.messages);
    },
    [activeSession, appendMessages, generateReply],
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
