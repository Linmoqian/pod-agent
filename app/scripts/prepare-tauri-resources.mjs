/*
 * 为 Tauri 开发态准备资源目录；开发 Agent 仍使用系统 Node，不读取占位运行时。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_ROOT = resolve(APP_ROOT, 'dist-agent');
const AGENT_BUNDLE = resolve(OUTPUT_ROOT, 'agent.mjs');
const NODE_RUNTIME_ROOT = resolve(OUTPUT_ROOT, 'node-runtime');

if (!existsSync(AGENT_BUNDLE)) {
  throw new Error('请先构建 Agent bundle');
}

await mkdir(NODE_RUNTIME_ROOT, { recursive: true });
await writeFile(
  resolve(NODE_RUNTIME_ROOT, '.dev-placeholder'),
  '开发态由系统 Node 执行 Agent；发行态构建前会替换为 Node.js v24.21.0。\n',
);

console.log(`Tauri dev resources ready: ${OUTPUT_ROOT}`);
