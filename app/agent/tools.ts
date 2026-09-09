/*
 * Pod Agent 工具集：YOLO 目标检测。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';

// 仓库根目录：工具与脚本均以此定位
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const YOLO_SCRIPT = join(REPO_ROOT, 'tests', 'YOLO', 'yolo_infer.py');

// 运行推理脚本的解释器：默认 conda base（装有 ultralytics），可用 YOLO_PYTHON 覆盖
const PYTHON_BIN =
  process.env.YOLO_PYTHON ?? '/Users/lin/miniforge3/bin/python';

// 单张 CPU 推理通常在数秒内完成，超时兜底防止子进程悬挂
const TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 8 * 1024;

// 启动子进程并收集输出；超时或父级 abort 时终止子进程
function runYolo(imagePath, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, [YOLO_SCRIPT, imagePath]);
    let stdoutText = '';
    let stderrText = '';
    let timedOut = false;

    const onAbort = () => child.kill('SIGTERM');
    signal?.addEventListener('abort', onAbort, { once: true });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdoutText += chunk.toString('utf8');
      if (stdoutText.length > MAX_OUTPUT_BYTES) {
        stdoutText = stdoutText.slice(0, MAX_OUTPUT_BYTES) + '…(输出已截断)';
      }
    });
    child.stderr.on('data', (chunk) => {
      stderrText += chunk.toString('utf8');
      if (stderrText.length > MAX_OUTPUT_BYTES) {
        stderrText = stderrText.slice(0, MAX_OUTPUT_BYTES);
      }
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new Error(`无法启动 Python：${error.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (timedOut) {
        reject(new Error(`执行超时（${TIMEOUT_MS / 1000} 秒）`));
        return;
      }
      if (code === 0) {
        resolve(stdoutText.trim());
        return;
      }
      reject(
        new Error(stderrText.trim() || stdoutText.trim() || `退出码 ${code}`),
      );
    });
  });
}

export const yoloDetectTool: AgentTool = {
  name: 'run_yolo_detection',
  label: 'YOLO 目标检测',
  description:
    '对本地图片运行 YOLO 目标检测，返回图中各目标的类别、置信度与坐标。' +
    '当用户提供图片路径并要求识别图中物体、检测目标数量时调用。',
  parameters: Type.Object({
    imagePath: Type.String({ description: '图片文件的绝对路径' }),
  }),
  async execute(_toolCallId, params, signal) {
    // 相对路径按仓库根目录解析，避免受进程 cwd 影响
    const imagePath = isAbsolute(params.imagePath)
      ? params.imagePath
      : join(REPO_ROOT, params.imagePath);
    if (!existsSync(imagePath) || !statSync(imagePath).isFile()) {
      throw new Error(`图片不存在：${imagePath}`);
    }

    try {
      const output = await runYolo(imagePath, signal);
      return {
        content: [{ type: 'text', text: output || '(检测无输出)' }],
        details: { imagePath },
      };
    } catch (error) {
      // 失败以异常回传，模型会收到工具失败结果并据此向用户说明
      throw new Error(
        `YOLO 检测失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};
