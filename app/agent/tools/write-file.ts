/*
 * Pod Agent 工具：write_file 将内容写入本地文件（覆盖写入）。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { writeFile } from 'node:fs/promises';

import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';

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
