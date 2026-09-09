/*
 * Pod Agent 工具集：readFile、writeFile、runCommand 最小三件套。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { exec } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';

const run = promisify(exec);

export const readFileTool: AgentTool = {
  name: 'read_file',
  label: 'Read File',
  description: '读取本地文本文件内容',

  parameters: Type.Object({
    path: Type.String(),
  }),

  async execute(_id, { path }) {
    const text = await readFile(path, 'utf8');
    return {
      content: [{ type: 'text', text }],
      details: { path },
    };
  },
};

export const writeFileTool: AgentTool = {
  name: 'write_file',
  label: 'Write File',
  description: '将内容写入本地文件（覆盖写入）',

  parameters: Type.Object({
    path: Type.String(),
    content: Type.String(),
  }),

  async execute(_id, { path, content }) {
    await writeFile(path, content, 'utf8');
    return {
      content: [{ type: 'text', text: `已写入 ${path}` }],
      details: { path },
    };
  },
};

export const runCommandTool: AgentTool = {
  name: 'run_command',
  label: 'Run Command',
  description: '执行本地 shell 命令',

  parameters: Type.Object({
    command: Type.String(),
  }),

  async execute(_id, { command }) {
    const { stdout, stderr } = await run(command);

    return {
      content: [
        {
          type: 'text',
          text: stdout || stderr,
        },
      ],
      details: {},
    };
  },
};

export const tools = [readFileTool, writeFileTool, runCommandTool];
