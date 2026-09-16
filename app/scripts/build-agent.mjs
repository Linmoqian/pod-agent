/*
 * 构建可随 Tauri 资源分发的单文件 Agent 与 YOLO 资源清单。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import { build } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(APP_ROOT, '..');
const OUTPUT_ROOT = resolve(APP_ROOT, 'dist-agent');
const RESOURCE_ROOT = resolve(OUTPUT_ROOT, 'agent-resources');
const MANIFEST_SOURCE = resolve(APP_ROOT, 'agent/tools/yolo-models.json');
const MANIFEST_DEST = resolve(RESOURCE_ROOT, 'agent/tools/yolo-models.json');
const SCRIPT_SOURCE = resolve(REPO_ROOT, 'tests/YOLO/yolo_tool.py');
const SCRIPT_DEST = resolve(RESOURCE_ROOT, 'tests/YOLO/yolo_tool.py');

function safeRelativePath(value, label) {
  if (
    !value ||
    isAbsolute(value) ||
    value.includes('\0') ||
    normalize(value).startsWith('..')
  ) {
    throw new Error(`${label} 资源路径无效`);
  }
  return value;
}

async function copyResource(relativePath) {
  const safePath = safeRelativePath(relativePath, 'YOLO');
  const candidates = [
    resolve(REPO_ROOT, safePath),
    resolve(REPO_ROOT, 'tests/YOLO', safePath),
  ];
  const source = candidates.find((candidate) => existsSync(candidate));
  if (!source) throw new Error(`YOLO 资源不存在: ${relativePath}`);
  const destination = resolve(RESOURCE_ROOT, safePath);
  const escaped = relative(RESOURCE_ROOT, destination);
  if (escaped.startsWith('..') || isAbsolute(escaped)) {
    throw new Error(`YOLO 资源目标路径无效: ${relativePath}`);
  }
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

const manifest = JSON.parse(await readFile(MANIFEST_SOURCE, 'utf8'));
if (
  !Array.isArray(manifest) ||
  manifest.some(
    (entry) =>
      !entry ||
      typeof entry.id !== 'string' ||
      typeof entry.path !== 'string' ||
      typeof entry.description !== 'string',
  )
) {
  throw new Error('YOLO 模型清单无效');
}

await rm(OUTPUT_ROOT, { recursive: true, force: true });
await mkdir(RESOURCE_ROOT, { recursive: true });

await build({
  entryPoints: [resolve(APP_ROOT, 'agent/agent.ts')],
  bundle: true,
  outfile: resolve(OUTPUT_ROOT, 'agent.mjs'),
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['node:*'],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  sourcemap: false,
  legalComments: 'none',
});

await mkdir(dirname(MANIFEST_DEST), { recursive: true });
await copyFile(MANIFEST_SOURCE, MANIFEST_DEST);
await mkdir(dirname(SCRIPT_DEST), { recursive: true });
await copyFile(SCRIPT_SOURCE, SCRIPT_DEST);

const resourceFields = [
  'path',
  'onnxPath',
  'appleOnnxPath',
  'appleBatch8OnnxPath',
];
const resourcePaths = new Set();
for (const entry of manifest) {
  for (const field of resourceFields) {
    if (typeof entry[field] === 'string') resourcePaths.add(entry[field]);
  }
}
for (const resourcePath of resourcePaths) await copyResource(resourcePath);

await writeFile(
  resolve(OUTPUT_ROOT, 'manifest.json'),
  `${JSON.stringify({ node: '24.21.0', resources: [...resourcePaths] }, null, 2)}\n`,
);
console.log(`Agent bundle ready: ${resolve(OUTPUT_ROOT, 'agent.mjs')}`);
