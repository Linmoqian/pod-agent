/*
 * 聊天流式生成服务:把会话消息映射为 pi-ai Context 并驱动 streamSimple。
 * assistant 历史按 pi-ai 的完整 AssistantMessage 形状重建(用量置零、stopReason=stop);
 * 错误语义:pi-ai 的 error 事件正常结束迭代,结果从 result() 取出,
 * 此处统一转换为可抛出的中文错误,由调用方写入助手消息。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import type {
  Api,
  AssistantMessage,
  Context,
  Message,
  Model,
  Models,
} from "@earendil-works/pi-ai";
import type { ChatMessage } from "../types";

export const BREEDING_SYSTEM_PROMPT = `你是 Pod Agent,面向大豆育种的智能助手。
回答要求:专业严谨、结论先行、必要时给出依据与数据来源;不确定时明确说明,不编造品种性状或试验数据。
涉及田间操作时给出可执行步骤,并提醒结合当地气候与栽培条件调整。`;

/** ChatRole 只有 user/assistant;time 为展示文案,统一以转换时刻补齐时间戳 */
function toPiMessages(model: Model<Api>, messages: ChatMessage[]): Message[] {
  const now = Date.now();
  return messages.map((message): Message => {
    if (message.role === "user") {
      return {
        role: "user",
        content: message.content,
        timestamp: now,
      };
    }
    // 历史助手消息重建为纯文本块;用量与停止原因对后续请求无语义影响
    const assistant: AssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: message.content }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: now,
    };
    return assistant;
  });
}

export function buildChatContext(
  model: Model<Api>,
  messages: ChatMessage[],
  systemPrompt: string = BREEDING_SYSTEM_PROMPT,
): Context {
  return {
    systemPrompt,
    messages: toPiMessages(model, messages),
  };
}

export type StreamCallbacks = {
  /** 增量正文到达;由调用方追加进助手消息 */
  onDelta: (delta: string) => void;
};

/**
 * 流式生成一条助手回复。
 * 返回最终文本;失败时抛出 Error,已送达的增量不回滚。
 */
export async function streamAssistantReply(
  models: Models,
  model: Model<Api>,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  options?: { signal?: AbortSignal },
): Promise<string> {
  const stream = models.streamSimple(
    model,
    buildChatContext(model, messages),
    { signal: options?.signal },
  );

  let text = "";
  for await (const event of stream) {
    if (event.type === "text_delta") {
      text += event.delta;
      callbacks.onDelta(event.delta);
    }
  }

  const final = await stream.result();
  if (final.stopReason === "error") {
    throw new Error(final.errorMessage ?? "模型返回未知错误");
  }
  if (final.stopReason === "aborted") {
    throw new Error("已中止生成");
  }
  return text;
}
