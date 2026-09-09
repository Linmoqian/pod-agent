/*
 * Pod Agent 工具：run_command 执行本地 shell 命令。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';

const run = promisify(exec);

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
