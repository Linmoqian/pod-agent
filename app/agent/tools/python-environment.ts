/*
 * 检查 YOLO 使用的 Python 环境，不安装或修改依赖。
 * Created on 2026-09-14
 * @author: https://github.com/Linmoqian
 */
import { execFile } from 'node:child_process';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { discoverYoloEnvironments } from './conda-environments.ts';

const PROBE = `import json, sys, os, importlib.util
from importlib.metadata import version, PackageNotFoundError
packages = {}
for name in ('ultralytics', 'torch', 'numpy', 'PIL'):
    installed = importlib.util.find_spec(name) is not None
    try:
        package_version = version('Pillow' if name == 'PIL' else name) if installed else None
    except PackageNotFoundError:
        package_version = None
    packages[name] = {'installed': installed, 'version': package_version}
print(json.dumps({'python': sys.version.split()[0], 'conda': os.path.isdir(os.path.join(sys.prefix, 'conda-meta')), 'packages': packages}))`;

export const checkPythonEnvironmentTool: AgentTool = {
  name: 'check_python_environment',
  label: '检查 Python 环境',
  description: '枚举 conda 环境并尝试导入 ultralytics，返回可用的 environmentName 供 YOLO 工具选择；同时检查默认 Python。不安装软件，导入成功不等于推理验证通过。',
  parameters: Type.Object({}),
  async execute(_id, _params, signal) {
    if (signal?.aborted) throw new Error('环境检查已取消');
    const report = await new Promise<object>((accept) => {
      execFile(process.env.YOLO_PYTHON ?? 'python', ['-c', PROBE],
        { timeout: 10_000, maxBuffer: 16 * 1024, signal, killSignal: 'SIGKILL' },
        (error, stdout) => {
          if (error) {
            accept({ ok: false, status: 'probe_failed', message: 'Python 不可用或检查失败，请配置 YOLO_PYTHON；未安装任何软件。' });
            return;
          }
          try {
            const result = JSON.parse(stdout);
            accept({ ok: true, ...result, inferenceVerified: false });
          } catch {
            accept({ ok: false, status: 'invalid_output' });
          }
        });
    });
    if (signal?.aborted) throw new Error('环境检查已取消');
    let discovery: object;
    try {
      discovery = { ok: true, environments: await discoverYoloEnvironments(signal) };
    } catch {
      if (signal?.aborted) throw new Error('环境检查已取消');
      discovery = { ok: false, message: '无法枚举 conda 环境，请检查 conda 是否可用。' };
    }
    return { content: [{ type: 'text', text: JSON.stringify({ defaultPython: report, discovery }) }], details: {} };
  },
};
