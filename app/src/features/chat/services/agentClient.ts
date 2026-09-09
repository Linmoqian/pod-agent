/*
 * Agent 对话客户端：通过 Vite 本地代理消费 Node Agent 的 NDJSON 增量流。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import type { ChatMessage } from "../types";

const AGENT_ENDPOINT = "/api/agent/chat";

type AgentEvent =
  | { type: "text_delta"; delta: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type AgentStreamCallbacks = {
  onDelta: (delta: string) => void;
};

function parseEvent(line: string): AgentEvent {
  try {
    return JSON.parse(line) as AgentEvent;
  } catch {
    throw new Error("Agent 返回了无法解析的流数据");
  }
}

function handleEvent(
  event: AgentEvent,
  callbacks: AgentStreamCallbacks,
): boolean {
  if (event.type === "text_delta") {
    callbacks.onDelta(event.delta);
    return false;
  }
  if (event.type === "error") {
    throw new Error(event.message || "Agent 返回未知错误");
  }
  return event.type === "done";
}

export async function streamAgentReply(
  messages: ChatMessage[],
  callbacks: AgentStreamCallbacks,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const response = await fetch(AGENT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: messages.map(({ role, content }) => ({ role, content })),
    }),
    signal: options?.signal,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      payload?.error ?? `Agent 请求失败：HTTP ${response.status}`,
    );
  }
  if (!response.body) {
    throw new Error("Agent 响应缺少流数据");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedDone = false;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) {
        receivedDone = handleEvent(parseEvent(line), callbacks) || receivedDone;
      }
    }
    if (done) break;
  }

  if (buffer.trim()) {
    receivedDone = handleEvent(parseEvent(buffer), callbacks) || receivedDone;
  }
  if (!receivedDone) {
    throw new Error("Agent 响应意外中断");
  }
}
