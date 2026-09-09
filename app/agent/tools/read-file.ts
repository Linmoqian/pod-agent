/*
 * Pod Agent 工具：read_file 读取本地文本文件。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { readFile } from 'node:fs/promises';

import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';

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
