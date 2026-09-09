/*
 * Pod Agent 本地开发进程，终端流式对话。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { Agent } from '@earendil-works/pi-agent-core';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';

import { tools } from './tools.ts';

const SYSTEM_PROMPT = 'You are Pod Agent.';
const EXIT_COMMAND = 'exit';

// 配置只来自 .env
const provider = process.env.MODEL_PROVIDER;
const modelId = process.env.MODEL_ID;

if (!provider || !modelId) {
  throw new Error('缺少 .env 配置：MODEL_PROVIDER 与 MODEL_ID');
}

// 内置模型目录按 provider/id 查模型
const models = builtinModels();
const model = models.getModel(provider, modelId);

if (!model) {
  throw new Error(`Model not found: ${provider}/${modelId}`);
}

const agent = new Agent({
  initialState: {
    systemPrompt: SYSTEM_PROMPT,
    model,
    tools,
  },
  streamFn: models.streamSimple.bind(models),
});

// 订阅转文本流与工具状态：工具执行期间没有文本流，用状态行告知进度
agent.subscribe((event) => {
  if (
    event.type === 'message_update' &&
    event.assistantMessageEvent.type === 'text_delta'
  ) {
    stdout.write(event.assistantMessageEvent.delta);
    return;
  }
  if (event.type === 'tool_execution_start') {
    stdout.write(`\n[tool] ${event.toolName} 执行中…\n`);
    return;
  }
  if (event.type === 'tool_execution_end') {
    stdout.write(
      `[tool] ${event.toolName} ${event.isError ? '失败' : '完成'}\n`,
    );
  }
});

const rl = createInterface({ input: stdin, output: stdout });

process.stdout.write(
  `[system] 已就绪：${provider}/${modelId}，输入 exit 退出\n`,
);

while (true) {
  let message;
  try {
    message = await rl.question('\nYou: ');
  } catch (error) {
    // 管道输入结束时 readline 会自动 close，按 exit 处理让进程正常退出
    if (rl.closed || error?.code === 'ERR_USE_AFTER_CLOSE') break;
    throw error;
  }

  if (message === EXIT_COMMAND) break;

  stdout.write('Pod: ');
  await agent.prompt(message);
  stdout.write('\n');
}

rl.close();
