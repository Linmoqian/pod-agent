/*
 * lian 受控 Agent 进程：plan（结构化计划）与 discuss（自由讨论）两种请求。
 * 讨论模式可对用户指定图片调用 YOLO；计划模式不加载工具，禁止虚构数据。
 * Created on 2026-09-12
 * Updated on 2026-09-14
 * @author: https://github.com/Linmoqian
 */

import { createInterface } from 'node:readline';

import { Agent } from '@earendil-works/pi-agent-core';
import { contentText } from '@earendil-works/pi-ai';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { discussionTools } from './tools.ts';

type PlanRequest = {
  requestId: string;
  type: 'plan';
  intent: string;
  dataset: {
    id: string;
    name: string;
    schema: unknown;
    qualityStatus: string;
  };
};

type DiscussRequest = {
  requestId: string;
  type: 'discuss';
  message: string;
  history: Array<{ role: string; content: string }>;
  context: {
    project: { name: string } | null;
    datasets: Array<{
      id: string;
      name: string;
      type: string;
      traits?: unknown;
    }>;
    artifacts: string[];
  };
};

type AgentRequest = PlanRequest | DiscussRequest;

const PLAN_SYSTEM_PROMPT =
  '你是 lian@育种台的受控计划器。只输出 JSON 对象，字段为 title、traitId、summary。traitId 必须来自 Dataset schema.traits；不调用工具，不访问文件，不作材料淘汰结论。';

function discussSystemPrompt(context: DiscussRequest['context']) {
  const hasData = context.datasets.length > 0;
  const projectLine = context.project
    ? `Project: ${context.project.name}`
    : 'Project: null（临时会话）';
  const datasetLines = hasData
    ? context.datasets
        .map((dataset) => `- ${dataset.name}（${dataset.type}）`)
        .join('\n')
    : 'Datasets: []';
  return [
    '你是 lian@育种台，面向大豆育种的研究助手。',
    '当前真实上下文（每次回答都必须以此为准确认自己拥有什么）：',
    projectLine,
    datasetLines,
    `Artifacts: ${context.artifacts.length ? context.artifacts.join('、') : '[]'}`,
    '',
    '能力边界：',
    '- 默认使用 onnx 常驻后端，无需 Python。选择 python 后端时，先调用 check_python_environment 并指定可用 environmentName；环境缺失时不擅自安装依赖。',
    '- 可调用 YOLO：先查询模型清单，再按 modelId 使用指定权重。仅使用用户提供的图片路径，不猜测路径或数量；不支持的类别应说明限制。工具计数是检测估计。',
    '- 可以：讨论、解释方法（如 BLUP/BLUE/GWAS）、设计实验、规划分析流程、写代码、给出去噪与统计建议。',
    '- 不可以：假装拥有上面未列出的数据、虚构统计结果（如「你的数据中有 N 个异常值」）、执行任何工作流或修改数据。',
    hasData
      ? '- 当前会话已绑定真实 Dataset：涉及具体数据结论时说明需要运行受控工作流来验证，不凭空给数值。'
      : '- 当前没有真实 Dataset：数值只能来自实际工具结果、明确标注的示例或文献，不得虚构分析。',
    '',
    '回复使用简体中文 Markdown，简洁、要点化；适合在育种工作台的时间线中阅读。',
  ].join('\n');
}

const provider = process.env.MODEL_PROVIDER;
const modelId = process.env.MODEL_ID;
const models = builtinModels();
const model =
  provider && modelId ? models.getModel(provider, modelId) : undefined;

process.stdout.write(
  `${JSON.stringify({
    type: 'handshake',
    ok: Boolean(model),
    model: model ? `${provider}/${modelId}` : null,
  })}\n`,
);

if (!model) {
  process.stderr.write(
    'MODEL_PROVIDER 或 MODEL_ID 未配置，讨论与计划均不可用\n',
  );
}

type AgentReply = {
  text: string;
  reasoning?: string;
};

type ReplyDelta = {
  kind: 'thinking' | 'text';
  delta: string;
};

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

async function runPrompt(
  systemPrompt: string,
  prompt: string,
  includeReasoning = false,
  onDelta?: (delta: ReplyDelta) => void,
): Promise<AgentReply> {
  let text = '';
  let reasoning = '';
  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools: includeReasoning ? discussionTools : [],
      thinkingLevel: includeReasoning && model?.reasoning ? 'low' : 'off',
    },
    streamFn: models.streamSimple.bind(models),
  });
  agent.subscribe((event) => {
    if (event.type === 'message_update') {
      if (event.assistantMessageEvent.type === 'text_delta') {
        text += event.assistantMessageEvent.delta;
        onDelta?.({ kind: 'text', delta: event.assistantMessageEvent.delta });
      }
      if (event.assistantMessageEvent.type === 'thinking_delta') {
        reasoning += event.assistantMessageEvent.delta;
        onDelta?.({
          kind: 'thinking',
          delta: event.assistantMessageEvent.delta,
        });
      }
    }
  });
  await agent.prompt(prompt);
  const lastMessage = agent.state.messages.at(-1);
  if (!text && lastMessage?.role === 'assistant') {
    text = contentText(lastMessage.content);
  }
  if (!reasoning && lastMessage?.role === 'assistant') {
    reasoning = thinkingText(lastMessage.content);
  }
  return {
    text,
    reasoning: reasoning.trim() || undefined,
  };
}

function foldHistory(request: DiscussRequest) {
  const turns = request.history
    .filter((turn) => turn.content?.trim())
    .map(
      (turn) =>
        `${turn.role === 'user' ? '用户' : 'lian'}：${turn.content.trim()}`,
    )
    .join('\n\n');
  return turns
    ? `【此前对话】\n${turns}\n\n【当前问题】\n${request.message}`
    : request.message;
}

const input = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

for await (const line of input) {
  let request: AgentRequest | undefined;
  try {
    request = JSON.parse(line) as AgentRequest;
    if (!model) {
      throw new Error('模型未配置');
    }
    if (request.type === 'plan') {
      const response = await runPrompt(
        PLAN_SYSTEM_PROMPT,
        JSON.stringify({ intent: request.intent, dataset: request.dataset }),
      );
      process.stdout.write(
        `${JSON.stringify({
          type: 'plan.result',
          requestId: request.requestId,
          ok: true,
          model: `${provider}/${modelId}`,
          proposal: response.text,
        })}\n`,
      );
    } else {
      const response = await runPrompt(
        discussSystemPrompt(request.context),
        foldHistory(request),
        true,
        (delta) => {
          process.stdout.write(
            `${JSON.stringify({
              type: 'discuss.delta',
              requestId: request?.requestId,
              ...delta,
            })}\n`,
          );
        },
      );
      process.stdout.write(
        `${JSON.stringify({
          type: 'discuss.result',
          requestId: request.requestId,
          ok: true,
          model: `${provider}/${modelId}`,
          reply: response.text,
          reasoning: response.reasoning,
        })}\n`,
      );
    }
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        type: request?.type === 'plan' ? 'plan.result' : 'discuss.result',
        requestId: request?.requestId ?? null,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
  }
}
