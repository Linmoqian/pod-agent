/*
 * 常驻 lian Agent：协议 v2、会话内串行、跨会话并发与请求级取消。
 * Created on 2026-09-12
 * Updated on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import { once } from 'node:events';

import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import {
  contentText,
  createProvider,
  type Api,
  type AssistantMessage,
  type Model,
  type Message,
} from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { discussionTools } from './tools.ts';

const PROTOCOL_VERSION = 2 as const;

type RuntimeModelRequest = {
  providerId: string;
  modelId: string;
  customProvider?: { baseUrl: string };
  /** 只由 Rust 通过 stdin 注入，禁止进入任何 stdout 事件或结果。 */
  apiKey?: string;
};

type HistoryTurn = { role: 'user' | 'assistant'; content: string };

type PromptRequest = {
  protocol: typeof PROTOCOL_VERSION;
  type: 'prompt';
  requestId: string;
  conversationId: string;
  mode: 'discuss' | 'plan';
  model: RuntimeModelRequest;
  history: HistoryTurn[];
  context: Record<string, unknown>;
  message: string;
};

type ActiveRequest = {
  request: PromptRequest;
  agent: Agent;
  runtimeKey: { value?: string };
  session?: AgentSessionState;
  aborted: boolean;
};

type AgentSessionState = {
  conversationId: string;
  modelKey: string;
  agent: Agent;
  runtimeKey: { value?: string };
  resetRequested?: boolean;
};

type Reply = { text: string; reasoning?: string; model: string };

class RequestFailure extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RequestFailure';
    this.code = code;
  }
}

const PLAN_SYSTEM_PROMPT =
  '你是 lian@育种台的受控计划器。只输出 JSON 对象，字段为 title、traitId、summary。traitId 必须来自 Dataset schema.traits；不调用工具，不访问文件，不作材料淘汰结论。';

function discussSystemPrompt(context: Record<string, unknown>) {
  const project = context.project as { name?: unknown } | null | undefined;
  const datasets = Array.isArray(context.datasets)
    ? context.datasets.filter(isDatasetSummary)
    : [];
  const artifacts = Array.isArray(context.artifacts)
    ? context.artifacts.filter((item): item is string => typeof item === 'string')
    : [];
  const projectLine =
    typeof project?.name === 'string'
      ? `Project: ${project.name}`
      : 'Project: null（临时会话）';
  const datasetLines = datasets.length
    ? datasets.map((dataset) => `- ${dataset.name}（${dataset.type}）`).join('\n')
    : 'Datasets: []';
  return [
    '你是 lian@育种台，面向大豆育种的研究助手。',
    '当前真实上下文（每次回答都必须以此为准确认自己拥有什么）：',
    projectLine,
    datasetLines,
    `Artifacts: ${artifacts.length ? artifacts.join('、') : '[]'}`,
    '',
    '能力边界：',
    '- 默认使用 onnx 常驻后端，无需 Python。选择 python 后端时，先调用 check_python_environment 并指定可用 environmentName；环境缺失时不擅自安装依赖。',
    '- 可调用 YOLO：先查询模型清单，再按 modelId 使用指定权重。用户提供单张图片时调用 run_yolo_detection；用户明确说有一批图片或给出文件夹位置时必须调用 run_yolo_batch_detection，并把文件夹绝对路径传给 folderPath，不要逐张调用单图工具。仅使用用户提供的图片路径，不猜测路径或数量；不支持的类别应说明限制。工具计数是检测估计。',
    '- 可以：讨论、解释方法（如 BLUP/BLUE/GWAS）、设计实验、规划分析流程、写代码、给出去噪与统计建议。',
    '- 不可以：假装拥有上面未列出的数据、虚构统计结果（如「你的数据中有 N 个异常值」）、执行任何工作流或修改数据。',
    datasets.length
      ? '- 当前会话已绑定真实 Dataset：涉及具体数据结论时说明需要运行受控工作流来验证，不凭空给数值。'
      : '- 当前没有真实 Dataset：数值只能来自实际工具结果、明确标注的示例或文献，不得虚构。',
    '',
    '回复简洁、专业、禁用 emoji、尊重事实',
    '使用简体中文回复。',
  ].join('\n');
}

function isDatasetSummary(value: unknown): value is { name: string; type: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { name?: unknown }).name === 'string' &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isModelRequest(value: unknown): value is RuntimeModelRequest {
  if (!isRecord(value)) return false;
  // 开发态允许 Rust 用空对象表示“交给 agent/.env 默认模型”；发行态会在 Rust 边界提前拒绝。
  if (Object.keys(value).length === 0) return true;
  if (
    typeof value.providerId !== 'string' ||
    typeof value.modelId !== 'string'
  ) {
    return false;
  }
  if (value.customProvider !== undefined) {
    if (
      !isRecord(value.customProvider) ||
      typeof value.customProvider.baseUrl !== 'string' ||
      !value.providerId.startsWith('custom-')
    ) {
      return false;
    }
  }
  return value.apiKey === undefined || typeof value.apiKey === 'string';
}

function isPromptRequest(value: unknown): value is PromptRequest {
  if (!isRecord(value)) return false;
  if (
    value.protocol !== PROTOCOL_VERSION ||
    value.type !== 'prompt' ||
    typeof value.requestId !== 'string' ||
    !value.requestId ||
    typeof value.conversationId !== 'string' ||
    !value.conversationId ||
    (value.mode !== 'discuss' && value.mode !== 'plan') ||
    !isModelRequest(value.model) ||
    !Array.isArray(value.history) ||
    !value.history.every(isHistoryTurn) ||
    !isRecord(value.context) ||
    typeof value.message !== 'string'
  ) {
    return false;
  }
  return true;
}

function isHistoryTurn(value: unknown): value is HistoryTurn {
  return (
    isRecord(value) &&
    (value.role === 'user' || value.role === 'assistant') &&
    typeof value.content === 'string'
  );
}

function failureFromUnknown(error: unknown): RequestFailure {
  if (error instanceof RequestFailure) return error;
  return new RequestFailure('AGENT_FAILED', '模型请求失败，请稍后重试');
}

let outputTail = Promise.resolve();

async function emit(value: Record<string, unknown>) {
  const line = `${JSON.stringify(value)}\n`;
  outputTail = outputTail
    .catch(() => undefined)
    .then(async () => {
      if (process.stdout.write(line)) return;
      await once(process.stdout, 'drain');
    });
  await outputTail;
}

function customModel(
  providerId: string,
  baseUrl: string,
  modelId: string,
): Model<'openai-completions'> {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  return {
    id: modelId,
    name: modelId,
    api: 'openai-completions',
    provider: providerId,
    baseUrl: normalizedBaseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  };
}

const models = builtinModels();
const sessions = new Map<string, AgentSessionState>();
const activeRequests = new Map<string, ActiveRequest>();
const activeTasks = new Set<Promise<void>>();
let shuttingDown = false;

function resolveModel(request: RuntimeModelRequest): {
  model: Model<Api>;
  modelKey: string;
  apiKey?: string;
} {
  const hasSelection = Boolean(request.providerId && request.modelId);
  if (!hasSelection) {
    if (process.env.POD_AGENT_PACKAGED === '1') {
      throw new RequestFailure('MODEL_REQUIRED', '发行版必须先选择模型');
    }
    const providerId = process.env.MODEL_PROVIDER;
    const modelId = process.env.MODEL_ID;
    if (!providerId || !modelId) {
      throw new RequestFailure('MODEL_REQUIRED', '请先选择对话模型');
    }
    const model = models.getModel(providerId, modelId);
    if (!model) {
      throw new RequestFailure('MODEL_NOT_FOUND', '开发态默认模型不存在');
    }
    return { model, modelKey: `${providerId}/${modelId}` };
  }

  if (request.customProvider) {
    if (!/^https?:\/\/[^\s]+$/.test(request.customProvider.baseUrl)) {
      throw new RequestFailure('PROVIDER_URL_INVALID', '自定义 Provider 地址无效');
    }
    models.setProvider(
      createProvider({
        id: request.providerId,
        name: request.providerId,
        baseUrl: request.customProvider.baseUrl.replace(/\/+$/, ''),
        auth: {
          apiKey: {
            name: `${request.providerId} API Key`,
            resolve: async () => ({ auth: {}, source: 'Rust request' }),
          },
        },
        models: [
          customModel(
            request.providerId,
            request.customProvider.baseUrl,
            request.modelId,
          ),
        ],
        api: openAICompletionsApi(),
      }),
    );
  }

  const model = models.getModel(request.providerId, request.modelId);
  if (!model) {
    throw new RequestFailure('MODEL_NOT_FOUND', '所选模型不存在或尚未刷新');
  }
  return {
    model,
    modelKey: `${request.providerId}/${request.modelId}`,
    apiKey: request.apiKey,
  };
}

function zeroUsage(): AssistantMessage['usage'] {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function historyMessages(history: HistoryTurn[]): Message[] {
  return history
    .filter((turn) => turn.content.trim())
    .map((turn, index) => {
      const timestamp = Date.now() - (history.length - index) * 1000;
      if (turn.role === 'user') {
        return { role: 'user', content: turn.content, timestamp };
      }
      return {
        role: 'assistant',
        content: [{ type: 'text', text: turn.content }],
        api: 'openai-completions',
        provider: 'history',
        model: 'history',
        usage: zeroUsage(),
        stopReason: 'stop',
        timestamp,
      };
    });
}

function thinkingText(content: unknown) {
  if (!Array.isArray(content)) return '';
  return content
    .flatMap((part) => {
      if (
        typeof part === 'object' &&
        part !== null &&
        'type' in part &&
        part.type === 'thinking' &&
        'thinking' in part &&
        typeof part.thinking === 'string'
      ) {
        return [part.thinking];
      }
      return [];
    })
    .join('');
}

function createAgent(
  systemPrompt: string,
  model: Model<Api>,
  messages: AgentMessage[],
  includeTools: boolean,
  runtimeKey: { value?: string },
) {
  return new Agent({
    initialState: {
      systemPrompt,
      model,
      messages,
      tools: includeTools ? discussionTools : [],
      thinkingLevel: includeTools && model.reasoning ? 'low' : 'off',
    },
    getApiKey: () => runtimeKey.value,
    streamFn: models.streamSimple.bind(models),
  });
}

function sessionFor(
  request: PromptRequest,
  resolved: ReturnType<typeof resolveModel>,
): AgentSessionState {
  const previous = sessions.get(request.conversationId);
  if (previous && previous.modelKey === resolved.modelKey) {
    previous.agent.state.systemPrompt = discussSystemPrompt(request.context);
    previous.runtimeKey.value = resolved.apiKey;
    return previous;
  }
  const runtimeKey: { value?: string } = { value: resolved.apiKey };
  const session: AgentSessionState = {
    conversationId: request.conversationId,
    modelKey: resolved.modelKey,
    runtimeKey,
    agent: createAgent(
      discussSystemPrompt(request.context),
      resolved.model,
      previous?.agent.state.messages ?? historyMessages(request.history),
      true,
      runtimeKey,
    ),
  };
  sessions.set(request.conversationId, session);
  return session;
}

function yoloTaskFromStart(event: Record<string, unknown>) {
  if (event.toolName !== 'run_yolo_detection') return undefined;
  const args = isRecord(event.args) ? event.args : {};
  return {
    id: typeof event.toolCallId === 'string' ? event.toolCallId : '',
    status: 'running',
    imagePath: typeof args.imagePath === 'string' ? args.imagePath : undefined,
    modelId: typeof args.modelId === 'string' ? args.modelId : undefined,
  };
}

function yoloTaskFromEnd(event: Record<string, unknown>) {
  if (event.toolName !== 'run_yolo_detection') return undefined;
  const args = isRecord(event.args) ? event.args : {};
  const result = isRecord(event.result) ? event.result : {};
  const details = isRecord(result.details) ? result.details : {};
  const summary = isRecord(result.content)
    ? undefined
    : Array.isArray(result.content)
      ? result.content.find(
          (item): item is { type: 'text'; text: string } =>
            isRecord(item) && item.type === 'text' && typeof item.text === 'string',
        )
      : undefined;
  let message = 'YOLO 推理失败或已取消';
  if (summary) {
    try {
      const parsed = JSON.parse(summary.text) as { message?: unknown };
      if (typeof parsed.message === 'string') message = parsed.message;
    } catch {
      // 工具摘要不是计数结果时保持稳定错误文案。
    }
  }
  return {
    id: typeof event.toolCallId === 'string' ? event.toolCallId : '',
    status: event.isError === true ? 'error' : 'done',
    imagePath: typeof args.imagePath === 'string' ? args.imagePath : undefined,
    modelId: typeof args.modelId === 'string' ? args.modelId : undefined,
    message,
    count: details.count,
    counts: details.counts,
    detections: details.detections,
  };
}

function yoloTaskFromUpdate(event: Record<string, unknown>) {
  if (event.toolName !== 'run_yolo_batch_detection') return undefined;
  const partialResult = isRecord(event.partialResult) ? event.partialResult : {};
  const details = isRecord(partialResult.details) ? partialResult.details : {};
  const status = details.status;
  if (
    details.eventType !== 'image' ||
    typeof details.id !== 'string' ||
    typeof details.imagePath !== 'string' ||
    !['queued', 'running', 'done', 'error'].includes(String(status))
  ) {
    return undefined;
  }
  return {
    id: details.id,
    status,
    imagePath: details.imagePath,
    modelId: details.modelId,
    message: details.message,
    count: details.count,
    counts: details.counts,
    detections: details.detections,
  };
}

async function runAgent(
  active: ActiveRequest,
  systemPrompt: string,
  model: Model<Api>,
  modelKey: string,
  includeTools: boolean,
): Promise<Reply> {
  const { request, agent } = active;
  let text = '';
  let reasoning = '';
  agent.state.systemPrompt = systemPrompt;
  agent.state.model = model;
  agent.state.tools = includeTools ? discussionTools : [];
  const unsubscribe = agent.subscribe(async (event) => {
    if (event.type === 'message_update') {
      if (event.assistantMessageEvent.type === 'text_delta') {
        text += event.assistantMessageEvent.delta;
        await emit({
          protocol: PROTOCOL_VERSION,
          type: 'event',
          requestId: request.requestId,
          conversationId: request.conversationId,
          eventType: 'reply.delta',
          kind: 'text',
          delta: event.assistantMessageEvent.delta,
        });
      }
      if (event.assistantMessageEvent.type === 'thinking_delta') {
        reasoning += event.assistantMessageEvent.delta;
        await emit({
          protocol: PROTOCOL_VERSION,
          type: 'event',
          requestId: request.requestId,
          conversationId: request.conversationId,
          eventType: 'reply.delta',
          kind: 'thinking',
          delta: event.assistantMessageEvent.delta,
        });
      }
    }
    if (
      event.type === 'tool_execution_start' ||
      event.type === 'tool_execution_end' ||
      event.type === 'tool_execution_update'
    ) {
      const view = event as unknown as Record<string, unknown>;
      const task =
        event.type === 'tool_execution_start'
          ? yoloTaskFromStart(view)
          : event.type === 'tool_execution_end'
            ? yoloTaskFromEnd(view)
            : yoloTaskFromUpdate(view);
      if (task && task.id) {
        await emit({
          protocol: PROTOCOL_VERSION,
          type: 'event',
          requestId: request.requestId,
          conversationId: request.conversationId,
          eventType: 'yolo.task',
          kind: 'tool',
          delta: '',
          task,
        });
      }
    }
  });
  try {
    if (active.aborted) {
      throw new RequestFailure('AGENT_ABORTED', '请求已取消');
    }
    await agent.prompt(request.message);
    const lastMessage = agent.state.messages.at(-1);
    if (
      active.aborted ||
      (lastMessage?.role === 'assistant' && lastMessage.stopReason === 'aborted')
    ) {
      throw new RequestFailure('AGENT_ABORTED', '请求已取消');
    }
    if (lastMessage?.role === 'assistant' && lastMessage.stopReason === 'error') {
      throw new RequestFailure('MODEL_REQUEST_FAILED', '模型请求失败，请检查模型与凭据');
    }
    if (!text && lastMessage?.role === 'assistant') {
      text = contentText(lastMessage.content);
    }
    if (!reasoning && lastMessage?.role === 'assistant') {
      reasoning = thinkingText(lastMessage.content);
    }
    if (!text.trim()) {
      throw new RequestFailure('AGENT_EMPTY_RESPONSE', '模型没有返回有效文本');
    }
    return {
      text,
      reasoning: reasoning.trim() || undefined,
      model: modelKey,
    };
  } catch (error) {
    throw failureFromUnknown(error);
  } finally {
    unsubscribe();
  }
}

async function emitAccepted(requestId: string) {
  await emit({
    protocol: PROTOCOL_VERSION,
    type: 'accepted',
    requestId,
  });
}

async function emitFailure(
  requestId: string,
  code: string,
  message: string,
  status: 'failed' | 'aborted' = code === 'AGENT_ABORTED' ? 'aborted' : 'failed',
) {
  await emit({
    protocol: PROTOCOL_VERSION,
    type: 'result',
    requestId,
    ok: false,
    errorCode: code,
    error: message,
  });
  await emit({
    protocol: PROTOCOL_VERSION,
    type: 'settled',
    requestId,
    status,
  });
}

async function handlePrompt(request: PromptRequest) {
  await emitAccepted(request.requestId);
  if (activeRequests.has(request.requestId)) {
    await emitFailure(request.requestId, 'AGENT_BUSY', '相同请求正在处理中');
    return;
  }
  if ([...activeRequests.values()].some((item) => item.request.conversationId === request.conversationId)) {
    await emitFailure(request.requestId, 'AGENT_BUSY', '同一会话已有请求正在处理中');
    return;
  }

  const resolved = resolveModel(request.model);
  let session: AgentSessionState | undefined;
  let agent: Agent;
  let runtimeKey: { value?: string };
  if (request.mode === 'discuss') {
    session = sessionFor(request, resolved);
    agent = session.agent;
    runtimeKey = session.runtimeKey;
  } else {
    runtimeKey = { value: resolved.apiKey };
    agent = createAgent(PLAN_SYSTEM_PROMPT, resolved.model, [], false, runtimeKey);
  }
  const active: ActiveRequest = {
    request,
    agent,
    runtimeKey,
    session,
    aborted: false,
  };
  activeRequests.set(request.requestId, active);
  try {
    await emit({
      protocol: PROTOCOL_VERSION,
      type: 'event',
      requestId: request.requestId,
      conversationId: request.conversationId,
      eventType: 'reply.started',
      kind: 'status',
      delta: '',
    });
    const reply = await runAgent(
      active,
      request.mode === 'plan' ? PLAN_SYSTEM_PROMPT : discussSystemPrompt(request.context),
      resolved.model,
      resolved.modelKey,
      request.mode === 'discuss',
    );
    await emit({
      protocol: PROTOCOL_VERSION,
      type: 'result',
      requestId: request.requestId,
      ok: true,
      reply: reply.text,
      reasoning: reply.reasoning,
      model: reply.model,
    });
    await emit({
      protocol: PROTOCOL_VERSION,
      type: 'settled',
      requestId: request.requestId,
      status: 'succeeded',
    });
  } catch (error) {
    const failure = failureFromUnknown(error);
    await emitFailure(
      request.requestId,
      failure.code,
      failure.message,
      failure.code === 'AGENT_ABORTED' ? 'aborted' : 'failed',
    );
  } finally {
    active.runtimeKey.value = undefined;
    activeRequests.delete(request.requestId);
    if (session?.resetRequested) sessions.delete(session.conversationId);
  }
}

async function handleAbort(requestId: string) {
  const active = activeRequests.get(requestId);
  if (!active) return;
  active.aborted = true;
  active.agent.abort();
}

async function handleSessionReset(conversationId: string) {
  const active = [...activeRequests.values()].find(
    (item) => item.request.conversationId === conversationId,
  );
  if (active) {
    if (active.session) active.session.resetRequested = true;
    active.aborted = true;
    active.agent.abort();
  } else {
    sessions.delete(conversationId);
  }
}

async function handleRequest(value: unknown) {
  if (!isRecord(value) || value.protocol !== PROTOCOL_VERSION) {
    await emit({
      protocol: PROTOCOL_VERSION,
      type: 'error',
      errorCode: 'AGENT_PROTOCOL_ERROR',
      error: '请求协议版本无效',
    });
    return;
  }
  if (value.type === 'prompt') {
    if (!isPromptRequest(value)) {
      await emit({
        protocol: PROTOCOL_VERSION,
        type: 'error',
        errorCode: 'AGENT_PROTOCOL_ERROR',
        error: 'prompt 字段无效',
      });
      return;
    }
    try {
      await handlePrompt(value);
    } catch (error) {
      const failure = failureFromUnknown(error);
      await emitFailure(value.requestId, failure.code, failure.message);
    }
    return;
  }
  if (value.type === 'abort' && typeof value.requestId === 'string') {
    await handleAbort(value.requestId);
    return;
  }
  if (value.type === 'session.reset' && typeof value.conversationId === 'string') {
    await handleSessionReset(value.conversationId);
    return;
  }
  if (value.type === 'shutdown') {
    shuttingDown = true;
    for (const active of activeRequests.values()) {
      active.aborted = true;
      active.agent.abort();
    }
    return;
  }
  await emit({
    protocol: PROTOCOL_VERSION,
    type: 'error',
    errorCode: 'AGENT_PROTOCOL_ERROR',
    error: '未知请求类型',
  });
}

async function drainInput() {
  while (activeTasks.size > 0) {
    await Promise.allSettled([...activeTasks]);
  }
  await outputTail.catch(() => undefined);
  process.exit(0);
}

await emit({
  protocol: PROTOCOL_VERSION,
  type: 'ready',
  capabilities: { sessions: true, abort: true },
});

let inputBuffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  inputBuffer += chunk;
  let newlineIndex = inputBuffer.indexOf('\n');
  while (newlineIndex >= 0) {
    const line = inputBuffer.slice(0, newlineIndex).replace(/\r$/, '');
    inputBuffer = inputBuffer.slice(newlineIndex + 1);
    newlineIndex = inputBuffer.indexOf('\n');
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      void emit({
        protocol: PROTOCOL_VERSION,
        type: 'error',
        errorCode: 'AGENT_PROTOCOL_ERROR',
        error: 'JSONL 行格式无效',
      });
      continue;
    }
    const task = handleRequest(parsed).catch(() => undefined);
    activeTasks.add(task);
    void task.finally(() => activeTasks.delete(task));
  }
});
process.stdin.on('end', () => {
  if (inputBuffer.trim()) {
    try {
      const task = handleRequest(JSON.parse(inputBuffer)).catch(() => undefined);
      activeTasks.add(task);
      void task.finally(() => activeTasks.delete(task));
    } catch {
      void emit({
        protocol: PROTOCOL_VERSION,
        type: 'error',
        errorCode: 'AGENT_PROTOCOL_ERROR',
        error: 'JSONL 尾帧格式无效',
      });
    }
  }
  if (shuttingDown || process.stdin.readableEnded) void drainInput();
});
