/*
 * 下载并校验随 Tauri 分发的 Node.js 运行时。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const NODE_VERSION = '24.21.0';
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_ROOT = resolve(APP_ROOT, 'dist-agent/node-runtime');
const CACHE_ROOT = resolve(APP_ROOT, '.node-runtime-cache');

const RELEASES = {
  arm64: {
    file: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
    sha256: 'bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057',
  },
  x64: {
    file: `node-v${NODE_VERSION}-darwin-x64.tar.gz`,
    sha256: '1462cb3b3046b815cf8ea436d3da450ec1a9f11dac7e5a46b0ada5305d7e8097',
  },
};

function selectedArch() {
  const argument = process.argv.find((value) => value.startsWith('--arch='));
  const requested = argument?.slice('--arch='.length);
  const arch = requested ?? process.arch;
  if (arch === 'arm64' || arch === 'x64') return arch;
  throw new Error(`不支持的 macOS Node 架构: ${arch}`);
}

async function sha256(path) {
  const content = await readFile(path);
  return createHash('sha256').update(content).digest('hex');
}

async function ensureArchive(release) {
  await mkdir(CACHE_ROOT, { recursive: true });
  const archive = resolve(CACHE_ROOT, release.file);
  if (!existsSync(archive)) {
    const url = `https://nodejs.org/dist/v${NODE_VERSION}/${release.file}`;
    let response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    } catch {
      throw new Error(`Node.js 下载失败: 无法连接 ${url}`);
    }
    if (!response.ok) {
      throw new Error(`Node.js 下载失败: HTTP ${response.status}`);
    }
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  }
  const actual = await sha256(archive);
  if (actual !== release.sha256) {
    throw new Error(`Node.js SHA-256 校验失败: ${release.file}`);
  }
  return archive;
}

async function checkRuntime(arch) {
  const node = resolve(OUTPUT_ROOT, 'bin/node');
  if (!existsSync(node)) throw new Error(`Node.js 运行时不存在: ${node}`);
  const result = await execFileAsync(node, ['--version']);
  if (result.stdout.trim() !== `v${NODE_VERSION}`) {
    throw new Error(`Node.js 版本不匹配: ${result.stdout.trim()}`);
  }
  console.log(`Node.js runtime verified: ${arch} v${NODE_VERSION}`);
}

const arch = selectedArch();
if (process.platform !== 'darwin' && !process.argv.includes('--check-only')) {
  throw new Error('随包 Node.js 运行时脚本只支持在 macOS 上执行');
}

if (process.argv.includes('--check')) {
  await checkRuntime(arch);
} else {
  const release = RELEASES[arch];
  const archive = await ensureArchive(release);
  const extractRoot = resolve(CACHE_ROOT, `extract-${arch}`);
  await rm(extractRoot, { recursive: true, force: true });
  await mkdir(extractRoot, { recursive: true });
  await execFileAsync('tar', [
    '-xzf',
    archive,
    '-C',
    extractRoot,
    '--strip-components=1',
  ]);
  await rm(OUTPUT_ROOT, { recursive: true, force: true });
  await mkdir(dirname(OUTPUT_ROOT), { recursive: true });
  await cp(extractRoot, OUTPUT_ROOT, { recursive: true });
  await checkRuntime(arch);
}
