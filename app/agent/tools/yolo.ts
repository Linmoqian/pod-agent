/*
 * YOLO 模型清单与指定模型计数工具。
 * Created on 2026-09-14
 * @author: https://github.com/Linmoqian
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { resolveEnvironment } from './conda-environments.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SCRIPT = resolve(ROOT, 'tests/YOLO/yolo_tool.py');
type ModelEntry = { id: string; name: string; path: string; description: string; onnxPath?: string; classes?: string[]; inputSize?: number };

function modelList(): ModelEntry[] {
  const entries = JSON.parse(readFileSync(new URL('./yolo-models.json', import.meta.url), 'utf8'));
  if (!Array.isArray(entries) || entries.some((entry) =>
    !entry || ['id', 'name', 'path', 'description'].some((key) =>
      typeof entry[key] !== 'string' || !entry[key].trim())) ||
    new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    throw new Error('YOLO 模型清单无效');
  }
  return entries;
}

export const listYoloModelsTool: AgentTool = {
  name: 'list_yolo_models',
  label: 'YOLO 模型清单',
  description: '识别前查询已登记的 YOLO 模型 ID、用途和权重可用性。',
  parameters: Type.Object({}),
  async execute() {
    return {
      content: [{ type: 'text', text: JSON.stringify(modelList().map(({ path, onnxPath, classes, inputSize, ...entry }) => ({
        ...entry, available: existsSync(resolve(ROOT, path)),
        backends: {
          python: existsSync(resolve(ROOT, path)),
          onnx: Boolean(onnxPath && existsSync(resolve(ROOT, onnxPath)) && process.env.YOLO_ONNX_URL),
        },
      }))) }],
      details: {},
    };
  },
};

const parameters = Type.Object({
  imagePath: Type.String({ minLength: 1, description: '用户提供的本地图片绝对路径' }),
  modelId: Type.String({ minLength: 1, description: '必填，来自 list_yolo_models 的模型 ID' }),
  backend: Type.Optional(Type.Union([Type.Literal('onnx'), Type.Literal('python')], { description: '默认 onnx 常驻 Rust 推理；python 需可用环境。不自动回退。' })),
  environmentName: Type.Optional(Type.String({ minLength: 1, description: '环境探头返回的可用 conda 环境名；省略时使用 YOLO_PYTHON 或 PATH 的 python' })),
  targetClass: Type.Optional(Type.String({ minLength: 1, description: '权重原始类别名；不填则统计所有类别' })),
  minConfidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
});

export const yoloDetectTool: AgentTool<typeof parameters> = {
  name: 'run_yolo_detection',
  label: 'YOLO 目标计数',
  description: '先查模型清单，再用指定模型识别用户提供的图片。只返回过滤后的计数，不返回检测框。结果是检测估计，不是人工真值。',
  parameters,
  async execute(_id, params, signal) {
    const entry = modelList().find((item) => item.id === params.modelId);
    if (!entry) throw new Error('未知模型 ID，请查询模型清单');
    if (!isAbsolute(params.imagePath)) throw new Error('图片必须使用绝对路径');
    const confidence = params.minConfidence ?? 0.25;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error('置信度必须在 0 到 1 之间');
    }
    if (signal?.aborted) throw new Error('检测已取消');
    if ((params.backend ?? 'onnx') === 'onnx') {
      if (params.environmentName) throw new Error('environmentName 仅用于 python 后端');
      const url = process.env.YOLO_ONNX_URL;
      const token = process.env.YOLO_ONNX_TOKEN;
      if (!url || !token) throw new Error('常驻 ONNX 服务未连接，请通过桌面应用调用或显式选择 python 后端');
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: entry.id, imagePath: params.imagePath,
          targetClass: params.targetClass, minConfidence: confidence }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error('ONNX 服务请求失败');
      const summary = await response.json();
      if (typeof summary.ok !== 'boolean' || typeof summary.message !== 'string') throw new Error('ONNX 返回格式无效');
      return {
        content: [{ type: 'text', text: JSON.stringify({ modelId: entry.id, backend: 'onnx',
          minConfidence: confidence, ok: summary.ok, message: summary.message }) }],
        details: {},
      };
    }
    const args = [SCRIPT, '--image', params.imagePath, '--model', resolve(ROOT, entry.path),
      '--confidence', String(confidence)];
    if (params.targetClass) args.push('--target-class', params.targetClass);
    const python = params.environmentName
      ? await resolveEnvironment(params.environmentName, signal)
      : process.env.YOLO_PYTHON ?? 'python';
    const output = await new Promise<string>((accept, reject) => {
      execFile(python, args,
        { timeout: 60_000, maxBuffer: 64 * 1024, signal, killSignal: 'SIGKILL' },
        (error, stdout) => {
          if (error) reject(new Error('YOLO 推理失败或已取消，请检查 Python 依赖、图片和权重'));
          else accept(stdout);
        });
    });
    const summary = JSON.parse(output);
    // 白名单重建结果，阻止检测框、图片路径和日志进入上下文。
    if (typeof summary.ok !== 'boolean' || typeof summary.message !== 'string') {
      throw new Error('YOLO 返回格式无效');
    }
    return {
      content: [{ type: 'text', text: JSON.stringify({
        modelId: entry.id, minConfidence: confidence, ok: summary.ok,
        message: summary.message,
      }) }],
      details: {},
    };
  },
};
