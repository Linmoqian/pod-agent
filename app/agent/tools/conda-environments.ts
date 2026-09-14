/*
 * 枚举 conda 环境并探测可加载的 ultralytics。
 * Created on 2026-09-14
 * @author: https://github.com/Linmoqian
 */
import { execFile } from 'node:child_process';
import { basename, join, resolve } from 'node:path';

export function runProbe(executable: string, args: string[], signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(new Error('检查已取消'));
  return new Promise<string>((accept, reject) => {
    execFile(executable, args,
      { timeout: 30_000, maxBuffer: 64 * 1024, signal, killSignal: 'SIGKILL' },
      (error, stdout) => error ? reject(error) : accept(stdout));
  });
}

export async function condaEnvironments(signal?: AbortSignal) {
  const info = JSON.parse(await runProbe(process.env.CONDA_EXE ?? 'conda', ['info', '--json'], signal));
  const list = JSON.parse(await runProbe(process.env.CONDA_EXE ?? 'conda', ['env', 'list', '--json'], signal));
  if (!Array.isArray(list.envs) || typeof info.root_prefix !== 'string' ||
      list.envs.some((prefix: unknown) => typeof prefix !== 'string')) {
    throw new Error('conda 环境清单无效');
  }
  const prefixes = [...new Set<string>(list.envs)];
  return prefixes.map((prefix) => ({
    name: resolve(prefix) === resolve(info.root_prefix) ? 'base' : basename(prefix),
    python: process.platform === 'win32' ? join(prefix, 'python.exe') : join(prefix, 'bin', 'python'),
  }));
}

export async function resolveEnvironment(name: string, signal?: AbortSignal) {
  const matches = (await condaEnvironments(signal)).filter((entry) => entry.name === name);
  if (matches.length !== 1) throw new Error('环境名不存在或重名，请检查 conda 环境清单');
  return matches[0].python;
}

export async function discoverYoloEnvironments(signal?: AbortSignal) {
  const environments = await condaEnvironments(signal);
  const results: Array<{ environmentName: string; available: boolean; version?: string; reason?: string }> = [];
  let next = 0;
  // 最多两个并发导入，避免同时加载多个 torch 环境占满内存。
  await Promise.all(Array.from({ length: Math.min(2, environments.length) }, async () => {
    while (next < environments.length) {
      if (signal?.aborted) throw new Error('检查已取消');
      const entry = environments[next++];
      if (environments.filter((item) => item.name === entry.name).length !== 1) {
        results.push({ environmentName: entry.name, available: false, reason: 'ambiguous_name' });
        continue;
      }
      try {
        const output = await runProbe(entry.python, ['-c',
          'import contextlib, sys, json\nwith contextlib.redirect_stdout(sys.stderr):\n import ultralytics\nprint(json.dumps({"version": ultralytics.__version__}))'], signal);
        const parsed = JSON.parse(output);
        if (typeof parsed.version !== 'string') throw new Error('无效版本');
        results.push({ environmentName: entry.name, available: true, version: parsed.version });
      } catch {
        if (signal?.aborted) throw new Error('检查已取消');
        results.push({ environmentName: entry.name, available: false, reason: 'import_failed_or_timeout' });
      }
    }
  }));
  return results.sort((a, b) => a.environmentName.localeCompare(b.environmentName));
}
