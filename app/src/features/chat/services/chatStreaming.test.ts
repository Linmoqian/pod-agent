/*
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { describe, expect, it, vi } from "vitest";
import type {
  AssistantMessage,
  AssistantMessageEvent,
  Model,
  Models,
} from "@earendil-works/pi-ai";
import type { ChatMessage } from "../types";
import { buildChatContext, streamAssistantReply } from "./chatStreaming";

const fakeModel = {
  id: "test-model",
  name: "Test Model",
  provider: "test",
  api: "openai-completions",
  baseUrl: "http://localhost:1/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 8192,
} as Model<"openai-completions">;

/** 手写最小事件流:复刻 pi-ai 迭代与 result() 语义,避免测试触网或取值导入 */
class FakeStream {
  private queue: AssistantMessageEvent[] = [];
  private done = false;
  private resolveResult!: (message: AssistantMessage) => void;
  readonly resultPromise: Promise<AssistantMessage>;

  constructor(script: (stream: FakeStream) => void) {
    this.resultPromise = new Promise((resolve) => {
      this.resolveResult = resolve;
    });
    queueMicrotask(() => script(this));
  }

  push(event: AssistantMessageEvent) {
    this.queue.push(event);
    if (event.type === "done") this.resolveResult(event.message);
    if (event.type === "error") this.resolveResult(event.error);
  }

  result(): Promise<AssistantMessage> {
    return this.resultPromise;
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<AssistantMessageEvent> {
    return this;
  }

  async next(): Promise<IteratorResult<AssistantMessageEvent>> {
    while (this.queue.length === 0 && !this.done) {
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
    }
    const value = this.queue.shift();
    if (value === undefined) return { value: undefined, done: true };
    if (value.type === "done" || value.type === "error") this.done = true;
    return { value, done: false };
  }
}

function baseMessage(): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: "openai-completions",
    provider: "test",
    model: "test-model",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "pending",
    timestamp: Date.now(),
  };
}

/** 构造一次性推送事件的假 Models */
function makeModels(script: (stream: FakeStream) => void): Models {
  return {
    streamSimple: () => new FakeStream(script),
  } as unknown as Models;
}

describe("buildChatContext", () => {
  it("映射会话消息并注入系统提示词", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "user", content: "你好", time: "10:00" },
      {
        id: "2",
        role: "assistant",
        content: "你好,有什么可以帮你?",
        time: "10:00",
      },
      { id: "3", role: "user", content: "对比品种", time: "10:01" },
    ];

    const context = buildChatContext(fakeModel, messages);
    expect(context.systemPrompt).toContain("大豆");
    expect(context.messages).toHaveLength(3);
    expect(context.messages[0]).toMatchObject({ role: "user", content: "你好" });
    const assistant = context.messages[1] as AssistantMessage;
    expect(assistant.role).toBe("assistant");
    expect(assistant.content).toEqual([
      { type: "text", text: "你好,有什么可以帮你?" },
    ]);
    expect(assistant.model).toBe("test-model");
  });
});

describe("streamAssistantReply", () => {
  it("聚合文本增量并回调", async () => {
    const models = makeModels((stream) => {
      const partial = baseMessage();
      stream.push({ type: "start", partial });
      stream.push({ type: "text_delta", contentIndex: 0, delta: "你", partial });
      stream.push({ type: "text_delta", contentIndex: 0, delta: "好", partial });
      stream.push({
        type: "done",
        reason: "stop",
        message: {
          ...partial,
          content: [{ type: "text", text: "你好" }],
          stopReason: "stop",
        },
      });
    });

    const onDelta = vi.fn();
    const text = await streamAssistantReply(models, fakeModel, [], { onDelta });

    expect(text).toBe("你好");
    expect(onDelta).toHaveBeenCalledWith("你");
    expect(onDelta).toHaveBeenCalledWith("好");
  });

  it("error 事件转换为可读错误", async () => {
    const models = makeModels((stream) => {
      const partial = baseMessage();
      stream.push({ type: "start", partial });
      stream.push({
        type: "error",
        reason: "error",
        error: { ...partial, stopReason: "error", errorMessage: "401 未授权" },
      });
    });

    await expect(
      streamAssistantReply(models, fakeModel, [], { onDelta: () => {} }),
    ).rejects.toThrow("401 未授权");
  });
});
