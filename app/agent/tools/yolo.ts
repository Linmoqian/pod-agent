/*
 * YOLO 模型清单与指定模型计数工具。
 * Created on 2026-09-14
 * @author: https://github.com/Linmoqian
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { resolveEnvironment } from './conda-environments.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SCRIPT = resolve(ROOT, 'tests/YOLO/yolo_tool.py');
type ModelEntry = { id: string; name: string; path: string; description: string; onnxPath?: string; classes?: string[]; inputSize?: number };
type Detection = {
  className: string;
  score: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
type InferenceSummary = {
  ok: boolean;
  message: string;
  count?: number;
  counts?: Record<string, number>;
  detections?: Detection[];
};
type BatchInferenceResponse = {
  ok: boolean;
  message: string;
  results?: InferenceSummary[];
};

const MAX_BATCH_IMAGES_PER_REQUEST = 64;
const MAX_BATCH_IMAGES_TOTAL = 10_000;

function isImagePath(path: string) {
  return /\.(?:jpe?g|png)$/i.test(path);
}

async function folderImages(folderPath: string, signal?: AbortSignal) {
  if (!isAbsolute(folderPath)) throw new Error('图片文件夹必须使用绝对路径');
  const root = await lstat(folderPath).catch(() => undefined);
  if (!root || root.isSymbolicLink() || !root.isDirectory()) {
    throw new Error('图片文件夹不可读');
  }
  const directories = [folderPath];
  const images: string[] = [];
  while (directories.length) {
    if (signal?.aborted) throw new Error('批量推理已取消');
    const directory = directories.pop();
    if (!directory) continue;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        directories.push(path);
      } else if (entry.isFile() && isImagePath(path)) {
        images.push(path);
        if (images.length > MAX_BATCH_IMAGES_TOTAL) {
          throw new Error(`单次批量最多处理 ${MAX_BATCH_IMAGES_TOTAL} 张图片`);
        }
      }
    }
  }
  return images.sort();
}

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
    const models = modelList().map((entry) => {
      const { path, onnxPath, classes, inputSize, ...summary } = entry;
      void classes;
      void inputSize;
      return {
        ...summary,
        available: existsSync(resolve(ROOT, path)),
        backends: {
          python: existsSync(resolve(ROOT, path)),
          onnx: Boolean(onnxPath && existsSync(resolve(ROOT, onnxPath)) && process.env.YOLO_ONNX_URL),
        },
      };
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(models) }],
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
      const summary = await response.json() as InferenceSummary;
      if (typeof summary.ok !== 'boolean' || typeof summary.message !== 'string') throw new Error('ONNX 返回格式无效');
      return {
        content: [{ type: 'text', text: JSON.stringify({ modelId: entry.id, backend: 'onnx',
          minConfidence: confidence, ok: summary.ok, message: summary.message }) }],
        // 仅由桌面事件消费标注数据，避免框坐标进入 Agent 对话上下文。
        details: {
          count: summary.count,
          counts: summary.counts,
          detections: summary.detections,
        },
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
    const summary = JSON.parse(output) as InferenceSummary;
    // 白名单重建结果，阻止检测框、图片路径和日志进入上下文。
    if (typeof summary.ok !== 'boolean' || typeof summary.message !== 'string') {
      throw new Error('YOLO 返回格式无效');
    }
    return {
      content: [{ type: 'text', text: JSON.stringify({
        modelId: entry.id, minConfidence: confidence, ok: summary.ok,
        message: summary.message,
      }) }],
      details: {
        count: summary.count,
        counts: summary.counts,
        detections: summary.detections,
      },
    };
  },
};

const batchParameters = Type.Object({
  folderPath: Type.String({ minLength: 1, description: '用户提供的本地图片文件夹绝对路径，会递归读取子文件夹' }),
  modelId: Type.String({ minLength: 1, description: '必填，来自 list_yolo_models 的模型 ID' }),
  targetClass: Type.Optional(Type.String({ minLength: 1, description: '权重原始类别名；不填则统计所有类别' })),
  minConfidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
});

export const yoloBatchDetectTool: AgentTool<typeof batchParameters> = {
  name: 'run_yolo_batch_detection',
  label: 'YOLO 批量推理',
  description: '对用户提供的图片文件夹递归批量推理。优先使用动态 Batch，任务会逐张同步到育种台；不要把同一文件夹拆成多次单图调用。仅返回汇总计数，结果图片和检测框由桌面任务界面消费。',
  parameters: batchParameters,
  executionMode: 'sequential',
  async execute(toolCallId, params, signal, onUpdate) {
    const entry = modelList().find((item) => item.id === params.modelId);
    if (!entry) throw new Error('未知模型 ID，请查询模型清单');
    const confidence = params.minConfidence ?? 0.25;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error('置信度必须在 0 到 1 之间');
    }
    const url = process.env.YOLO_ONNX_URL;
    const token = process.env.YOLO_ONNX_TOKEN;
    if (!url || !token) throw new Error('常驻 ONNX 服务未连接，请通过桌面应用调用');
    const paths = await folderImages(params.folderPath, signal);
    if (!paths.length) throw new Error('文件夹中没有 JPG、JPEG 或 PNG 图片');

    type EventStatus = 'queued' | 'running' | 'done' | 'error';
    const states = paths.map<EventStatus>(() => 'queued');
    const emitImage = (index: number, status: EventStatus, result?: InferenceSummary, message?: string) => {
      states[index] = status;
      onUpdate?.({
        content: [{ type: 'text', text: '' }],
        details: {
          eventType: 'image',
          id: `${toolCallId}:${index}`,
          status,
          imagePath: paths[index],
          modelId: entry.id,
          message: message ?? result?.message,
          count: result?.count,
          counts: result?.counts,
          detections: result?.detections,
        },
      });
    };
    paths.forEach((_, index) => emitImage(index, 'queued'));

    let completed = 0;
    let failed = 0;
    let count = 0;
    const counts: Record<string, number> = {};
    const batchUrl = new URL('/detect-batch', url).toString();
    const emitUnfinishedErrors = (start: number, message: string) => {
      for (let index = start; index < paths.length; index += 1) {
        if (states[index] === 'done' || states[index] === 'error') continue;
        emitImage(index, 'error', undefined, message);
        failed += 1;
      }
    };

    for (let start = 0; start < paths.length; start += MAX_BATCH_IMAGES_PER_REQUEST) {
      const end = Math.min(paths.length, start + MAX_BATCH_IMAGES_PER_REQUEST);
      for (let index = start; index < end; index += 1) emitImage(index, 'running');
      try {
        if (signal?.aborted) throw new Error('批量推理已取消');
        const response = await fetch(batchUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelId: entry.id,
            imagePaths: paths.slice(start, end),
            targetClass: params.targetClass,
            minConfidence: confidence,
          }),
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
        });
        if (!response.ok) throw new Error('ONNX 批量服务请求失败');
        const summary = await response.json() as BatchInferenceResponse;
        if (!summary.ok || typeof summary.message !== 'string' || !Array.isArray(summary.results) || summary.results.length !== end - start) {
          throw new Error(summary.message || 'ONNX 批量返回格式无效');
        }
        summary.results.forEach((result, offset) => {
          const index = start + offset;
          if (!result || typeof result.ok !== 'boolean' || typeof result.message !== 'string') {
            throw new Error('ONNX 单张结果格式无效');
          }
          if (result.ok) {
            completed += 1;
            count += result.count ?? 0;
            Object.entries(result.counts ?? {}).forEach(([name, value]) => {
              counts[name] = (counts[name] ?? 0) + value;
            });
            emitImage(index, 'done', result);
          } else {
            failed += 1;
            emitImage(index, 'error', undefined, result.message);
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        emitUnfinishedErrors(start, message);
        throw error;
      }
    }
    const message = `批量推理完成：共 ${paths.length} 张，成功 ${completed} 张，失败 ${failed} 张，检测到 ${count} 个对象`;
    return {
      content: [{ type: 'text', text: JSON.stringify({
        modelId: entry.id,
        backend: 'onnx',
        total: paths.length,
        completed,
        failed,
        count,
        counts,
        ok: failed === 0,
        message,
      }) }],
      details: { total: paths.length, completed, failed, count, counts },
    };
  },
};
