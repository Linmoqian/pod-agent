/*
 * Pod Agent 本地开发进程：从 .env 读取模型配置，使用 Pi Agent SDK 提供流式对话。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { createServer } from "node:http";
import { Agent } from "@earendil-works/pi-agent-core";
import { streamSimple } from "@earendil-works/pi-ai/compat";
import { Type } from "typebox";

const HOST = "127.0.0.1";
const PORT = 1430;
const MAX_BODY_BYTES = 1024 * 1024;
const SYSTEM_PROMPT = `你是 Pod Agent，面向大豆育种的智能助手。
回答要求：专业严谨、结论先行、必要时给出依据与数据来源；不确定时明确说明，不编造品种性状或试验数据。
涉及田间操作时给出可执行步骤，并提醒结合当地气候与栽培条件调整。`;

function timestamp() {
  return new Date().toISOString();
}

function log(tag, message) {
  process.stdout.write(`[${tag}] ${message} ${timestamp()}\n`);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`缺少 .env 配置：${name}`);
  }
  return value;
}

function loadConfig() {
  const baseUrl = requiredEnv("base_url").replace(/\/+$/u, "");
  try {
    new URL(baseUrl);
  } catch {
    throw new Error(".env 中的 base_url 不是有效 URL");
  }

  return {
    baseUrl,
    apiKey: requiredEnv("api_key"),
    model: requiredEnv("model"),
  };
}

function emptyUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function toAgentHistory(messages, modelId) {
  const now = Date.now();
  return messages.map((message) => {
    if (message.role === "user") {
      return { role: "user", content: message.content, timestamp: now };
    }
    return {
      role: "assistant",
      content: [{ type: "text", text: message.content }],
      api: "openai-completions",
      provider: "pod-agent",
      model: modelId,
      usage: emptyUsage(),
      stopReason: "stop",
      timestamp: now,
    };
  });
}

function validateMessages(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("messages 必须是非空数组");
  }

  const messages = value.map((message) => {
    if (
      !message ||
      (message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string" ||
      message.content.length === 0
    ) {
      throw new Error("消息格式无效");
    }
    return { role: message.role, content: message.content };
  });

  if (messages.at(-1)?.role !== "user") {
    throw new Error("最后一条消息必须来自用户");
  }
  return messages;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("请求内容超过 1 MB 限制");
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("请求体不是有效 JSON");
  }
}

function writeJsonLine(response, event) {
  if (!response.destroyed && !response.writableEnded) {
    response.write(`${JSON.stringify(event)}\n`);
  }
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n\u0000-\u001f]/gu, " ").slice(0, 300);
}

const currentTimeTool = {
  name: "get_current_time",
  label: "读取当前时间",
  description: "读取 Agent 进程当前的 UTC 时间；仅在用户询问当前时间时调用。",
  parameters: Type.Object({}),
  executionMode: "sequential",
  async execute() {
    const value = timestamp();
    return {
      content: [{ type: "text", text: value }],
      details: { timestamp: value },
    };
  },
};

function createModel(config) {
  return {
    id: config.model,
    name: config.model,
    api: "openai-completions",
    provider: "pod-agent",
    baseUrl: config.baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  };
}

async function handleChat(request, response, config) {
  const body = await readJson(request);
  const messages = validateMessages(body?.messages);
  const prompt = messages.at(-1).content;
  const history = messages.slice(0, -1);

  log("j接收", "用户消息");
  response.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  try {
    const agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model: createModel(config),
        messages: toAgentHistory(history, config.model),
        tools: [currentTimeTool],
      },
      streamFn: (model, context, options) =>
        streamSimple(model, context, { ...options, apiKey: config.apiKey }),
      toolExecution: "sequential",
    });

    agent.subscribe((event) => {
      if (
        event.type === "message_update" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        writeJsonLine(response, {
          type: "text_delta",
          delta: event.assistantMessageEvent.delta,
        });
      }
      if (event.type === "tool_execution_end") {
        log("tool", `${event.toolName} ${event.isError ? "失败" : "成功"}`);
      }
    });

    response.on("close", () => {
      if (!response.writableEnded) agent.abort();
    });

    await agent.prompt(prompt);
    const lastAssistant = [...agent.state.messages]
      .reverse()
      .find((message) => message.role === "assistant");
    if (lastAssistant?.role === "assistant") {
      if (lastAssistant.stopReason === "error") {
        throw new Error(lastAssistant.errorMessage ?? "Pi Agent 请求失败");
      }
      if (lastAssistant.stopReason === "aborted") {
        throw new Error("生成已中止");
      }
    }
    writeJsonLine(response, { type: "done" });
    log("发送", "消息");
  } catch (error) {
    const message = safeError(error);
    writeJsonLine(response, { type: "error", message });
    log("发送", `消息失败：${message}`);
  } finally {
    response.end();
  }
}

function respondJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

let config;
try {
  config = loadConfig();
} catch (error) {
  process.stderr.write(`[system] ${safeError(error)} ${timestamp()}\n`);
  process.exit(1);
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/api/agent/health") {
    respondJson(response, 200, { status: "ready" });
    return;
  }
  if (request.method !== "POST" || request.url !== "/api/agent/chat") {
    respondJson(response, 404, { error: "Not Found" });
    return;
  }

  try {
    await handleChat(request, response, config);
  } catch (error) {
    const message = safeError(error);
    if (response.headersSent) {
      writeJsonLine(response, { type: "error", message });
      response.end();
      return;
    }
    respondJson(response, 400, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  log("system", "agent 进程启动");
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
