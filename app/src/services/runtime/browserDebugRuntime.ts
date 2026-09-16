/* 浏览器调试运行时：用确定性的内存状态驱动完整前端流程。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import {
  createBrowserPreviewFile,
  createBrowserPreviewFileTree,
  createBrowserPreviewSnapshot,
} from './browserPreviewFixtures';
import type {
  Dataset,
  ImportInspection,
  Project,
  TaskPlan,
  TerminalRunResult,
  WorkflowRun,
  WorkspaceFileNode,
  WorkspaceFilePreview,
  WorkspaceSnapshot,
} from '../../features/workspace/types';
import type {
  BrowserDebugControls,
  BrowserDebugScenario,
  BrowserDebugState,
  FrontendRuntime,
  RuntimeAgentReplyDelta,
  RuntimeDropEvent,
  RuntimeEventMap,
  RuntimeEventName,
  RuntimeFile,
  RuntimeImageData,
  RuntimePickOptions,
  RuntimeSaveOptions,
  RuntimeUnlisten,
  RuntimeYoloDetection,
  RuntimeYoloEvent,
  RuntimeYoloProgressItem,
  RuntimeYoloResponse,
} from './types';

const DEBUG_IMAGE_INTERVAL_MS = 120;
const DEBUG_BATCH_SIZE = 8;
const DEBUG_AGENT_STEP_MS = 70;
const DEBUG_WORKFLOW_DELAY_MS = 480;

type InferenceItem = {
  id: string;
  imagePath: string;
  conversationId?: string;
  modelId: string;
  index: number;
  total: number;
  onItem?: (item: RuntimeYoloProgressItem) => void;
  onExternalEvent?: (event: RuntimeYoloEvent) => void;
  resolve?: () => void;
  generation: number;
};

type InferenceRequest = {
  remaining: number;
  resolve: () => void;
  generation: number;
};

type AgentMessage = {
  role: 'thinking' | 'text';
  delta: string;
};

function nowIso() {
  return new Date().toISOString();
}

function fileName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function mimeTypeOf(name: string, fallback = 'application/octet-stream') {
  const extension = extensionOf(name);
  if (extension === 'svg') return 'image/svg+xml';
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  return fallback;
}

function isImageName(name: string) {
  return /\.(?:jpe?g|png|webp|svg)$/i.test(name);
}

function isDataName(name: string) {
  return /\.(?:csv|tsv|txt|xlsx)$/i.test(name);
}

function cloneSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return structuredClone(snapshot);
}

function nextCloneTitle(sourceTitle: string, usedTitles: string[]) {
  const title = sourceTitle.trim() || '临时会话';
  const base = `${title}（副本）`;
  const used = new Set(usedTitles);
  if (!used.has(base)) return base;
  let number = 2;
  while (used.has(`${title}（副本 ${number}）`)) number += 1;
  return `${title}（副本 ${number}）`;
}

function isTerminalStatus(status: string) {
  return ['completed', 'succeeded', 'failed', 'cancelled', 'interrupted'].includes(status);
}

function remapValue(value: unknown, ids: Map<string, string>): unknown {
  if (typeof value === 'string') return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => remapValue(item, ids));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, remapValue(item, ids)]),
    );
  }
  return value;
}

type CloneMessageInput = {
  taskPlanId?: string | null;
  role?: string;
  content?: string;
  reasoning?: string | null;
  createdAt?: string;
};

function makeProject(id: string, name: string): Project {
  const timestamp = nowIso();
  return {
    id,
    name,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function makeDataset(projectId: string, id: string, name: string): Dataset {
  return {
    id,
    projectId,
    name,
    datasetType: 'phenotype',
    version: 1,
    schema: {
      traits: [
        { id: 'trait-height', name: '株高', valueType: 'number', unit: 'cm' },
      ],
    },
    source: { runtime: 'browser-debug' },
    metadata: { rowCount: 148 },
    qualityStatus: 'passed',
    supersedesId: null,
    createdAt: nowIso(),
  };
}

function makeTaskPlan(projectId: string, datasetId: string, intent: string): TaskPlan {
  const timestamp = nowIso();
  return {
    id: `debug-plan-${Date.now()}`,
    projectId,
    datasetId,
    title: '浏览器调试分析任务',
    intent,
    goal: intent,
    inputs: [{ kind: 'dataset', id: datasetId }],
    risks: ['当前结果为浏览器模拟结果，不代表真实模型性能'],
    traitId: 'trait-height',
    planner: {
      mode: 'browser-debug',
      model: 'browser-debug-model',
      summary: '已生成可交互的模拟任务计划',
    },
    modelSpec: { runtime: 'browser-debug' },
    expectedArtifacts: ['debug-report.json'],
    status: 'awaiting_confirmation',
    steps: [
      {
        id: 'debug-step-1',
        toolId: 'browser-debug-analysis',
        title: '模拟运行分析流程',
        status: 'waiting',
        riskLevel: 'low',
        dependsOn: [],
        parameters: {},
        expectedArtifacts: ['debug-report.json'],
      },
    ],
    createdAt: timestamp,
  };
}

function makeWorkflowRun(projectId: string, taskPlanId: string, status: string): WorkflowRun {
  return {
    id: `debug-run-${Date.now()}`,
    taskPlanId,
    projectId,
    status,
    errorCode: null,
    errorMessage: null,
    startedAt: nowIso(),
    finishedAt: null,
  };
}

function makeImageSvg(name: string, index: number) {
  const hue = 142 + (index % 4) * 18;
  const stemX = 280 + (index % 3) * 80;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560">`,
    `<rect width="800" height="560" rx="24" fill="hsl(${hue} 28% 26%)"/>`,
    '<path d="M80 450C220 380 270 270 360 120" fill="none" stroke="#d9c29b" stroke-width="18" stroke-linecap="round"/>',
    `<path d="M${stemX} 470C${stemX - 40} 350 ${stemX + 20} 230 ${stemX + 30} 92" fill="none" stroke="#78c49e" stroke-width="12" stroke-linecap="round"/>`,
    `<ellipse cx="${stemX - 40}" cy="350" rx="64" ry="22" transform="rotate(-26 ${stemX - 40} 350)" fill="#b8e3a1"/>`,
    `<ellipse cx="${stemX + 60}" cy="275" rx="62" ry="21" transform="rotate(28 ${stemX + 60} 275)" fill="#9dd28c"/>`,
    `<ellipse cx="${stemX - 4}" cy="188" rx="56" ry="20" transform="rotate(-35 ${stemX - 4} 188)" fill="#d2eba6"/>`,
    '<rect x="560" y="390" width="130" height="24" rx="12" fill="#17201d"/>',
    '<rect x="585" y="320" width="86" height="54" rx="8" fill="#f5edd5"/>',
    `<text x="40" y="64" fill="#edf7ef" font-family="sans-serif" font-size="26">${name}</text>`,
    '</svg>',
  ].join('');
}

function bytesToBase64(bytes: number[]) {
  if (typeof btoa !== 'function') return '';
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function bytesFromString(content: string) {
  return Array.from(new TextEncoder().encode(content));
}

function makeImageResultSvg(
  original: RuntimeImageData,
  detections: RuntimeYoloDetection[],
) {
  const base64 = bytesToBase64(original.bytes);
  const imageHref = base64
    ? `data:${original.mimeType};base64,${base64}`
    : '';
  const boxes = detections.map((detection, index) => {
    const x = Math.max(0, Math.min(760, detection.x * 800));
    const y = Math.max(0, Math.min(520, detection.y * 560));
    const width = Math.max(24, Math.min(240, detection.width * 800));
    const height = Math.max(24, Math.min(180, detection.height * 560));
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="#ffcf5c" stroke-width="5"/><text x="${x + 8}" y="${y + 24}" fill="#fff6d6" font-family="sans-serif" font-size="18">${index + 1}. ${detection.className} ${Math.round(detection.score * 100)}%</text>`;
  }).join('');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560">',
    '<rect width="800" height="560" fill="#16211d"/>',
    imageHref ? `<image href="${imageHref}" width="800" height="560" preserveAspectRatio="xMidYMid slice"/>` : '',
    boxes,
    '</svg>',
  ].join('');
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export default class BrowserDebugRuntime implements FrontendRuntime {
  readonly mode = 'browser-debug' as const;
  readonly debug: BrowserDebugControls;

  private readonly snapshots = new Map<string, WorkspaceSnapshot>();
  private readonly virtualFiles = new Map<string, RuntimeFile>();
  private readonly listeners = new Map<RuntimeEventName, Set<(payload: unknown) => void>>();
  private readonly debugListeners = new Set<() => void>();
  private readonly workflowTimers = new Map<string, number>();
  private readonly canceledAgents = new Set<string>();
  private readonly inferenceRequests = new Set<InferenceRequest>();
  private readonly yoloStatuses = new Map<string, RuntimeYoloEvent['status']>();
  private readonly yoloEvents = new Map<string, RuntimeYoloEvent>();
  private readonly retryableExternalItems = new Map<string, InferenceItem>();
  private readonly eventLog: string[] = [];
  private inferenceQueue: InferenceItem[] = [];
  private currentInference: InferenceItem | undefined;
  private inferenceTimer: number | undefined;
  private inferencePaused = false;
  private failNext = false;
  private localInferenceCompleted = 0;
  private localInferenceFailed = 0;
  private generation = 0;
  private projectCounter = 0;
  private conversationCounter = 0;
  private fileCounter = 0;
  private taskCounter = 0;
  private currentSnapshot: WorkspaceSnapshot;
  private projects: Project[] = [];
  private terminalAccess = true;

  constructor() {
    this.currentSnapshot = this.createSnapshot('browser-debug');
    this.snapshots.set(this.currentSnapshot.conversation.id, this.currentSnapshot);
    this.listeners.set('lian-import-event', new Set());
    this.listeners.set('lian-agent-event', new Set());
    this.listeners.set('lian-workflow-event', new Set());
    this.listeners.set('lian-yolo-event', new Set());
    this.listeners.set('lian-debug-event', new Set());
    this.debug = {
      loadScenario: (scenario) => this.loadScenario(scenario),
      reset: () => this.reset(),
      setInferencePaused: (paused) => this.setInferencePaused(paused),
      stepInference: (count) => this.stepInference(count),
      failNextInference: () => this.failNextInference(),
      retryFailedInference: () => this.retryFailedInference(),
      clearLog: () => this.clearLog(),
      getState: () => this.getDebugState(),
      subscribe: (listener) => {
        this.debugListeners.add(listener);
        return () => this.debugListeners.delete(listener);
      },
    };
  }

  private createSnapshot(id: string) {
    const preview = createBrowserPreviewSnapshot();
    return {
      ...preview,
      conversation: {
        ...preview.conversation,
        id,
        title: id === 'browser-debug' ? '浏览器调试会话' : '临时会话',
      },
    };
  }

  private emit<K extends RuntimeEventName>(eventName: K, payload: RuntimeEventMap[K]) {
    const callbacks = this.listeners.get(eventName);
    callbacks?.forEach((callback) => callback(payload));
  }

  private log(message: string) {
    this.eventLog.unshift(`${new Date().toLocaleTimeString()} ${message}`);
    if (this.eventLog.length > 80) this.eventLog.length = 80;
    this.notifyDebug();
    this.emit('lian-debug-event', {
      type: 'log',
      message,
      timestamp: nowIso(),
    });
  }

  private notifyDebug() {
    this.debugListeners.forEach((listener) => listener());
  }

  private updateSnapshot(snapshot: WorkspaceSnapshot, eventType = 'snapshot.changed') {
    this.snapshots.set(snapshot.conversation.id, snapshot);
    if (this.currentSnapshot.conversation.id === snapshot.conversation.id) {
      this.currentSnapshot = snapshot;
    }
    this.emit('lian-debug-event', {
      type: 'snapshot.changed',
      message: eventType,
      timestamp: nowIso(),
    });
    this.notifyDebug();
  }

  private addProjectSnapshot(snapshot: WorkspaceSnapshot) {
    if (snapshot.project && !this.projects.some((project) => project.id === snapshot.project?.id)) {
      this.projects = [...this.projects, snapshot.project];
    }
    this.activateSnapshot(snapshot);
  }

  private activateSnapshot(snapshot: WorkspaceSnapshot, eventType = 'snapshot.changed') {
    this.currentSnapshot = snapshot;
    this.snapshots.set(snapshot.conversation.id, snapshot);
    this.emit('lian-debug-event', {
      type: 'snapshot.changed',
      message: eventType,
      timestamp: nowIso(),
    });
    this.notifyDebug();
  }

  private emitYolo(event: RuntimeYoloEvent) {
    this.yoloStatuses.set(event.id, event.status);
    this.yoloEvents.set(event.id, event);
    this.emit('lian-yolo-event', event);
    const detail = event.imagePath ? `${fileName(event.imagePath)} ${event.status}` : `${event.id} ${event.status}`;
    this.log(`YOLO ${detail}`);
  }

  private finishInference(item: InferenceItem) {
    if (item.generation !== this.generation) return;
    const shouldFail = this.failNext;
    this.failNext = false;
    const detections: RuntimeYoloDetection[] = shouldFail
      ? []
      : Array.from({ length: item.index % 3 }, (_, index) => ({
          className: index % 2 ? 'leaf' : 'soybean',
          score: 0.86 - index * 0.08,
          x: 0.18 + index * 0.2,
          y: 0.22 + index * 0.12,
          width: 0.18,
          height: 0.2,
        }));
    const result: RuntimeYoloResponse = shouldFail
      ? { ok: false, message: '浏览器调试注入的推理失败' }
      : {
          ok: true,
          message: detections.length
            ? `检测到 ${detections.length} 个对象`
            : '未检测到达到阈值的对象',
          count: detections.length,
          counts: detections.reduce<Record<string, number>>((counts, detection) => {
            counts[detection.className] = (counts[detection.className] ?? 0) + 1;
            return counts;
          }, {}),
          detections,
        };
    if (item.onExternalEvent) {
      if (result.ok) this.retryableExternalItems.delete(item.id);
      else this.retryableExternalItems.set(item.id, { ...item });
      item.onExternalEvent({
        id: item.id,
        status: result.ok ? 'done' : 'error',
        conversationId: item.conversationId,
        imagePath: item.imagePath,
        modelId: item.modelId,
        message: result.message,
        count: result.count,
        counts: result.counts,
        detections: result.detections,
      });
    } else if (result.ok) {
      this.localInferenceCompleted += 1;
    } else {
      this.localInferenceFailed += 1;
    }
    item.onItem?.({
      imagePath: item.imagePath,
      index: item.index,
      total: item.total,
      result,
    });
    item.resolve?.();
    this.currentInference = undefined;
    this.inferenceTimer = undefined;
    if (!this.inferencePaused) this.pumpInference();
    this.notifyDebug();
  }

  private startInference(item: InferenceItem, immediate = false) {
    this.currentInference = item;
    if (item.onExternalEvent) {
      this.emitYolo({
        id: item.id,
        status: 'running',
        conversationId: item.conversationId,
        imagePath: item.imagePath,
        modelId: item.modelId,
      });
    }
    if (immediate) {
      this.finishInference(item);
      return;
    }
    this.inferenceTimer = window.setTimeout(() => this.finishInference(item), DEBUG_IMAGE_INTERVAL_MS);
    this.notifyDebug();
  }

  private pumpInference() {
    if (this.inferencePaused || this.currentInference || !this.inferenceQueue.length) return;
    const next = this.inferenceQueue.shift();
    if (!next || next.generation !== this.generation) {
      this.pumpInference();
      return;
    }
    this.startInference(next);
  }

  private settleRequest(request: InferenceRequest) {
    request.remaining -= 1;
    if (request.remaining <= 0) {
      this.inferenceRequests.delete(request);
      request.resolve();
    }
  }

  private queueInference(
    modelId: string,
    imagePaths: string[],
    onItem: (item: RuntimeYoloProgressItem) => void,
  ) {
    return new Promise<void>((resolve) => {
      if (!imagePaths.length) {
        resolve();
        return;
      }
      const request: InferenceRequest = {
        remaining: imagePaths.length,
        resolve,
        generation: this.generation,
      };
      this.inferenceRequests.add(request);
      imagePaths.forEach((imagePath, index) => {
        this.inferenceQueue.push({
          id: `local-${this.generation}-${this.fileCounter}-${index}-${imagePath}`,
          imagePath,
          modelId,
          index,
          total: imagePaths.length,
          onItem: (item) => {
            onItem(item);
            this.settleRequest(request);
          },
          generation: this.generation,
        });
      });
      this.log(`加入 ${imagePaths.length} 张图片，Batch=${DEBUG_BATCH_SIZE}`);
      this.pumpInference();
    });
  }

  private enqueueExternalInference(
    imagePaths: string[],
    modelId: string,
    conversationId: string,
  ) {
    if (!imagePaths.length) return;
    const taskId = ++this.taskCounter;
    imagePaths.forEach((imagePath, index) => {
      const id = `debug-task-${this.generation}-${taskId}-${index}`;
      this.emitYolo({
        id,
        status: 'queued',
        conversationId,
        imagePath,
        modelId,
      });
      this.inferenceQueue.push({
        id,
        imagePath,
        conversationId,
        modelId,
        index,
        total: imagePaths.length,
        onExternalEvent: (event) => this.emitYolo(event),
        generation: this.generation,
      });
    });
    this.log(`Agent 加入图片识别任务，共 ${imagePaths.length} 张`);
    this.pumpInference();
  }

  private async presetImages(count = DEBUG_BATCH_SIZE) {
    const files: RuntimeFile[] = [];
    for (let index = 0; index < count; index += 1) {
      const name = `IMG_${String(2632 + index).padStart(4, '0')}.png`;
      const content = makeImageSvg(name, index);
      const file = new File([content], name, { type: 'image/svg+xml' });
      const path = `browser-debug://images/${this.generation}/${name}`;
      const runtimeFile = { path, name, size: file.size, type: file.type, file };
      this.virtualFiles.set(path, runtimeFile);
      files.push(runtimeFile);
    }
    return files;
  }

  private async addScenarioImages(
    count = DEBUG_BATCH_SIZE,
    conversationId: string,
  ) {
    const generation = this.generation;
    const files = await this.presetImages(count);
    if (generation !== this.generation) return;
    this.fileCounter += files.length;
    this.enqueueExternalInference(
      files.map((file) => file.path),
      'yolov8n-coco',
      conversationId,
    );
  }

  private scenarioSnapshot(scenario: BrowserDebugScenario) {
    // 调试场景是当前会话的可重复夹具，不应偷偷创建一个控制器无法激活的新会话。
    const snapshot = this.createSnapshot(this.currentSnapshot.conversation.id);
    if (scenario === 'workspace' || scenario === 'agent' || scenario === 'full') {
      const project = makeProject(
        `browser-debug-project-${++this.projectCounter}`,
        '浏览器调试育种项目',
      );
      snapshot.project = project;
      snapshot.conversation.projectId = project.id;
      snapshot.conversation.title = project.name;
    }
    if (scenario === 'agent' || scenario === 'full') {
      snapshot.messages = [
        {
          id: 'debug-message-welcome',
          conversationId: snapshot.conversation.id,
          taskPlanId: null,
          role: 'assistant',
          content: '这是浏览器调试运行时。可以直接发送问题，或让 Agent 加入一批图片进行识别。',
          reasoning: '调试运行时不访问模型服务，只验证前端状态流转。',
          createdAt: nowIso(),
        },
      ];
    }
    if (scenario === 'full' && snapshot.project) {
      const dataset = makeDataset(
        snapshot.project.id,
        `browser-debug-dataset-${this.projectCounter}`,
        '演示表型数据.csv',
      );
      snapshot.datasets = [dataset];
      snapshot.taskPlans = [
        makeTaskPlan(snapshot.project.id, dataset.id, '比较不同材料的株高表现'),
      ];
    }
    return snapshot;
  }

  loadScenario(scenario: BrowserDebugScenario) {
    this.reset(false);
    const snapshot = this.scenarioSnapshot(scenario);
    this.addProjectSnapshot(snapshot);
    this.emit('lian-debug-event', {
      type: 'scenario.loaded',
      scenario,
      timestamp: nowIso(),
    });
    this.log(`加载场景：${scenario}`);
    if (scenario === 'yolo' || scenario === 'full') {
      void this.addScenarioImages(undefined, snapshot.conversation.id);
    }
  }

  private clearInference() {
    if (this.inferenceTimer !== undefined) {
      window.clearTimeout(this.inferenceTimer);
      this.inferenceTimer = undefined;
    }
    this.currentInference = undefined;
    this.inferenceQueue = [];
    this.inferenceRequests.forEach((request) => request.resolve());
    this.inferenceRequests.clear();
  }

  reset(announce = true) {
    this.clearInference();
    this.workflowTimers.forEach((timer) => window.clearTimeout(timer));
    this.workflowTimers.clear();
    this.generation += 1;
    this.virtualFiles.clear();
    this.projects = [];
    this.canceledAgents.clear();
    this.yoloStatuses.clear();
    this.yoloEvents.clear();
    this.retryableExternalItems.clear();
    this.eventLog.length = 0;
    this.inferencePaused = false;
    this.failNext = false;
    this.localInferenceCompleted = 0;
    this.localInferenceFailed = 0;
    this.projectCounter = 0;
    this.conversationCounter = 0;
    this.fileCounter = 0;
    this.taskCounter = 0;
    this.terminalAccess = true;
    this.currentSnapshot = this.createSnapshot('browser-debug');
    this.snapshots.clear();
    this.snapshots.set(this.currentSnapshot.conversation.id, this.currentSnapshot);
    this.emit('lian-debug-event', {
      type: 'reset',
      timestamp: nowIso(),
    });
    if (announce) {
      this.log('运行时已重置');
    }
    this.notifyDebug();
  }

  setInferencePaused(paused: boolean) {
    this.inferencePaused = paused;
    this.log(paused ? '推理队列已暂停' : '推理队列继续运行');
    if (!paused) this.pumpInference();
    this.notifyDebug();
  }

  private completeCurrentImmediately() {
    if (this.inferenceTimer !== undefined) {
      window.clearTimeout(this.inferenceTimer);
      this.inferenceTimer = undefined;
    }
    const current = this.currentInference;
    if (current) this.finishInference(current);
  }

  stepInference(count: 1 | 8) {
    this.inferencePaused = true;
    let processed = 0;
    if (this.currentInference) {
      this.completeCurrentImmediately();
      processed += 1;
    }
    while (processed < count && this.inferenceQueue.length) {
      const next = this.inferenceQueue.shift();
      if (!next) break;
      this.startInference(next, true);
      processed += 1;
    }
    this.log(`单步推进 ${processed} 张图片`);
    this.notifyDebug();
  }

  failNextInference() {
    this.failNext = true;
    this.log('已标记下一张图片为失败');
    this.notifyDebug();
  }

  retryFailedInference() {
    const retryable = [...this.retryableExternalItems.values()]
      .filter((item) => item.generation === this.generation);
    this.retryableExternalItems.clear();
    if (!retryable.length) {
      this.log('当前没有可重试的浏览器调试失败任务');
      return;
    }
    retryable.forEach((item) => {
      this.emitYolo({
        id: item.id,
        status: 'queued',
        imagePath: item.imagePath,
        modelId: item.modelId,
      });
      this.inferenceQueue.push({ ...item, resolve: undefined });
    });
    this.log(`重新加入 ${retryable.length} 张失败图片`);
    this.pumpInference();
    this.notifyDebug();
  }

  clearLog() {
    this.eventLog.length = 0;
    this.notifyDebug();
  }

  getDebugState(): BrowserDebugState {
    let queued = this.inferenceQueue.filter((item) => !item.onExternalEvent).length;
    let running = this.currentInference && !this.currentInference.onExternalEvent ? 1 : 0;
    let completed = this.localInferenceCompleted;
    let failed = this.localInferenceFailed;
    this.yoloStatuses.forEach((status) => {
      if (status === 'queued') queued += 1;
      else if (status === 'running') running += 1;
      else if (status === 'done') completed += 1;
      else if (status === 'error') failed += 1;
    });
    return {
      paused: this.inferencePaused,
      queued,
      running,
      completed,
      failed,
      eventLog: [...this.eventLog],
    };
  }

  private cloneConversationSnapshot(
    source: WorkspaceSnapshot,
    rawMessages: CloneMessageInput[] | undefined,
  ) {
    const conversationId = `browser-debug-${++this.conversationCounter}`;
    const ids = new Map<string, string>();
    const remapId = (oldId: string, prefix: string) => {
      const current = ids.get(oldId);
      if (current) return current;
      const next = `browser-debug-${prefix}-${this.generation}-${Date.now()}-${ids.size}`;
      ids.set(oldId, next);
      return next;
    };
    const project = source.project
      ? makeProject(
          `browser-debug-project-${++this.projectCounter}`,
          nextCloneTitle(source.project.name, this.projects.map((item) => item.name)),
        )
      : null;
    const clone = this.createSnapshot(conversationId);
    const conversationTitle = nextCloneTitle(
      source.conversation.title,
      [...this.snapshots.values()].map((item) => item.conversation.title),
    );
    clone.conversation = {
      ...source.conversation,
      id: conversationId,
      projectId: project?.id ?? null,
      title: conversationTitle,
      status: 'active',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    clone.project = project;

    const datasetIds = new Map(
      source.datasets.map((item) => [item.id, remapId(item.id, 'dataset')]),
    );
    const schemaIds = new Map(
      (source.schemas ?? []).map((item) => [item.id, remapId(item.id, 'schema')]),
    );
    const materialIds = new Map(
      (source.materials ?? []).map((item) => [item.id, remapId(item.id, 'material')]),
    );
    const traitIds = new Map(
      (source.traits ?? []).map((item) => [item.id, remapId(item.id, 'trait')]),
    );
    const environmentIds = new Map(
      (source.environments ?? []).map((item) => [item.id, remapId(item.id, 'environment')]),
    );
    const planIds = new Map(
      source.taskPlans.map((item) => [item.id, remapId(item.id, 'plan')]),
    );
    const terminalWorkflowRuns = source.workflowRuns.filter((item) => isTerminalStatus(item.status));
    const terminalTaskPlanRuns = (source.taskPlanRuns ?? []).filter((item) => isTerminalStatus(item.status));
    const runIds = new Map(
      [...terminalWorkflowRuns, ...terminalTaskPlanRuns].map((item) => [
        item.id,
        remapId(item.id, 'run'),
      ]),
    );
    const executionIds = new Map(
      (source.executions ?? [])
        .filter((item) => isTerminalStatus(item.status) && runIds.has(item.taskPlanRunId))
        .map((item) => [item.id, remapId(item.id, 'execution')]),
    );
    const artifactCandidates = source.artifacts.filter(
      (item) =>
        !['running', 'pending', 'partial', 'incomplete'].includes(item.status) &&
        (!item.producedByRunId || runIds.has(item.producedByRunId)),
    );
    const artifactSourceIds = new Set(source.artifacts.map((item) => item.id));
    const artifactIds = new Map(
      artifactCandidates.map((item) => [item.id, remapId(item.id, 'artifact')]),
    );
    const remapArtifactReference = (id: string) => {
      const mapped = artifactIds.get(id);
      if (mapped) return mapped;
      return artifactSourceIds.has(id) ? null : id;
    };

    clone.datasets = source.datasets.map((item) => ({
      ...item,
      id: datasetIds.get(item.id) ?? remapId(item.id, 'dataset'),
      projectId: project?.id ?? item.projectId,
      schema: remapValue(item.schema, ids) as typeof item.schema,
      source: remapValue(item.source, ids) as typeof item.source,
      metadata: remapValue(item.metadata, ids) as typeof item.metadata,
      supersedesId: item.supersedesId ? datasetIds.get(item.supersedesId) ?? null : null,
    }));
    clone.schemas = (source.schemas ?? []).map((item) => ({
      ...item,
      id: schemaIds.get(item.id) ?? remapId(item.id, 'schema'),
      projectId: project?.id ?? item.projectId,
      fields: remapValue(item.fields, ids),
      roles: remapValue(item.roles, ids),
    }));
    clone.materials = (source.materials ?? []).map((item) => ({
      ...item,
      id: materialIds.get(item.id) ?? remapId(item.id, 'material'),
      projectId: project?.id ?? item.projectId,
      metadata: remapValue(item.metadata, ids) as typeof item.metadata,
    }));
    clone.traits = (source.traits ?? []).map((item) => ({
      ...item,
      id: traitIds.get(item.id) ?? remapId(item.id, 'trait'),
      projectId: project?.id ?? item.projectId,
    }));
    clone.environments = (source.environments ?? []).map((item) => ({
      ...item,
      id: environmentIds.get(item.id) ?? remapId(item.id, 'environment'),
      projectId: project?.id ?? item.projectId,
      treatment: remapValue(item.treatment, ids),
      metadata: remapValue(item.metadata, ids),
    }));
    clone.taskPlans = source.taskPlans.map((item) => ({
      ...item,
      id: planIds.get(item.id) ?? remapId(item.id, 'plan'),
      projectId: project?.id ?? item.projectId,
      datasetId: datasetIds.get(item.datasetId) ?? item.datasetId,
      traitId: traitIds.get(item.traitId) ?? item.traitId,
      inputs: item.inputs?.map((input) => ({
        ...input,
        id: ids.get(input.id) ?? input.id,
      })),
      status: ['running', 'pending', 'paused'].includes(item.status)
        ? 'awaiting_confirmation'
        : item.status,
      planner: remapValue(item.planner, ids) as typeof item.planner,
      modelSpec: remapValue(item.modelSpec, ids) as typeof item.modelSpec,
      expectedArtifacts: item.expectedArtifacts
        .map(remapArtifactReference)
        .filter((id): id is string => Boolean(id)),
      steps: item.steps.map((step) => ({
        ...step,
        id: remapId(step.id, 'step'),
        dependsOn: step.dependsOn?.map((id) => ids.get(id) ?? id),
        parameters: remapValue(step.parameters, ids) as typeof step.parameters,
        expectedArtifacts: step.expectedArtifacts
          ?.map(remapArtifactReference)
          .filter((id): id is string => Boolean(id)),
      })),
    }));
    clone.workflowRuns = terminalWorkflowRuns.map((item) => ({
      ...item,
      id: runIds.get(item.id) ?? remapId(item.id, 'run'),
      taskPlanId: planIds.get(item.taskPlanId) ?? item.taskPlanId,
      projectId: project?.id ?? item.projectId,
    }));
    clone.taskPlanRuns = terminalTaskPlanRuns.map((item) => ({
      ...item,
      id: runIds.get(item.id) ?? remapId(item.id, 'run'),
      taskPlanId: planIds.get(item.taskPlanId) ?? item.taskPlanId,
      projectId: project?.id ?? item.projectId,
    }));
    clone.executions = (source.executions ?? [])
      .filter((item) => isTerminalStatus(item.status) && runIds.has(item.taskPlanRunId))
      .map((item) => ({
        ...item,
        id: executionIds.get(item.id) ?? remapId(item.id, 'execution'),
        taskPlanRunId: runIds.get(item.taskPlanRunId) ?? item.taskPlanRunId,
        projectId: project?.id ?? item.projectId,
        inputs: remapValue(item.inputs, ids),
        parameters: remapValue(item.parameters, ids),
        runtime: remapValue(item.runtime, ids),
      }));
    clone.artifacts = artifactCandidates.map((item) => ({
      ...item,
      id: artifactIds.get(item.id) ?? remapId(item.id, 'artifact'),
      projectId: project?.id ?? item.projectId,
      upstreamIds: item.upstreamIds
        .map((id) => artifactIds.get(id))
        .filter((id): id is string => Boolean(id)),
      producedByRunId: item.producedByRunId
        ? runIds.get(item.producedByRunId) ?? null
        : null,
      metadata: remapValue(item.metadata, ids) as typeof item.metadata,
    }));
    const messages = Array.isArray(rawMessages)
      ? rawMessages
      : source.messages;
    clone.messages = messages.flatMap((item, index) => {
      const role = item.role;
      if (role !== 'user' && role !== 'assistant') return [];
      const content = String(item.content ?? '');
      const reasoning = item.reasoning ? String(item.reasoning) : null;
      if (role === 'assistant' && !content.trim() && !reasoning?.trim()) return [];
      return [{
        id: `${conversationId}:message:${index}`,
        conversationId,
        taskPlanId: project
          ? item.taskPlanId
            ? planIds.get(item.taskPlanId) ?? null
            : null
          : null,
        role,
        content,
        reasoning,
        createdAt: item.createdAt || nowIso(),
      }];
    });
    clone.overview = project
      ? {
          project,
          materialCount: clone.materials?.length ?? 0,
          datasetCount: clone.datasets.length,
          executionCount: clone.executions?.length ?? 0,
          artifactCount: clone.artifacts.length,
          pendingResolutionCount: source.overview?.pendingResolutionCount ?? 0,
          facts: source.overview?.facts ?? [],
        }
      : undefined;
    if (project) this.projects = [...this.projects, project];
    return clone;
  }

  async listen<K extends RuntimeEventName>(
    eventName: K,
    callback: (payload: RuntimeEventMap[K]) => void,
  ): Promise<RuntimeUnlisten> {
    const callbacks = this.listeners.get(eventName);
    if (!callbacks) throw new Error(`未知运行时事件：${eventName}`);
    const listener = callback as (payload: unknown) => void;
    callbacks.add(listener);
    // 组件可能在场景已经启动后才完成挂载；回放每张图片的最新状态，避免任务卡丢失。
    if (eventName === 'lian-yolo-event') {
      this.yoloEvents.forEach((event) => listener(event));
    }
    return () => callbacks.delete(listener);
  }

  async invoke<T>(command: string, args: Record<string, unknown> = {}) {
    switch (command) {
      case 'list_projects':
        return this.projects as T;
      case 'create_project': {
        const project = makeProject(
          `browser-debug-project-${++this.projectCounter}`,
          String(args.name || '浏览器调试项目'),
        );
        this.projects = [...this.projects, project];
        return project as T;
      }
      case 'archive_project': {
        const projectId = String(args.projectId ?? '');
        this.projects = this.projects.filter((project) => project.id !== projectId);
        return { ...makeProject(projectId, '已归档项目'), status: 'archived' } as T;
      }
      case 'ensure_draft_project': {
        const project = makeProject(
          `browser-debug-project-${++this.projectCounter}`,
          String(args.nameHint || '未命名育种项目'),
        );
        this.projects = [...this.projects, project];
        return project as T;
      }
      case 'ensure_active_conversation':
        return cloneSnapshot(this.currentSnapshot) as T;
      case 'get_conversation_context': {
        const conversationId = String(args.conversationId ?? '');
        return cloneSnapshot(this.snapshots.get(conversationId) ?? this.currentSnapshot) as T;
      }
      case 'open_project_context': {
        const projectId = String(args.projectId ?? '');
        const snapshot = [...this.snapshots.values()].find((item) => item.project?.id === projectId)
          ?? this.createSnapshot(`browser-debug-project-${projectId}`);
        return cloneSnapshot(snapshot) as T;
      }
      case 'new_temporary_conversation': {
        const snapshot = this.createSnapshot(`browser-debug-${++this.conversationCounter}`);
        this.updateSnapshot(snapshot);
        return cloneSnapshot(snapshot) as T;
      }
      case 'clone_conversation': {
        const source = this.snapshots.get(String(args.conversationId ?? '')) ?? this.currentSnapshot;
        const messages = Array.isArray(args.messages)
          ? args.messages as CloneMessageInput[]
          : undefined;
        const clone = this.cloneConversationSnapshot(source, messages);
        this.activateSnapshot(clone, '会话副本已创建');
        return cloneSnapshot(clone) as T;
      }
      case 'send_message':
        return this.sendMessage<T>(
          String(args.conversationId ?? this.currentSnapshot.conversation.id),
          String(args.content ?? ''),
          String(args.requestId ?? `debug-request-${Date.now()}`),
        );
      case 'promote_conversation': {
        const conversationId = String(args.conversationId ?? this.currentSnapshot.conversation.id);
        const source = cloneSnapshot(this.snapshots.get(conversationId) ?? this.currentSnapshot);
        const project = makeProject(
          `browser-debug-project-${++this.projectCounter}`,
          String(args.name ?? '浏览器调试项目'),
        );
        source.project = project;
        source.conversation = {
          ...source.conversation,
          projectId: project.id,
          title: project.name,
          updatedAt: nowIso(),
        };
        this.projects = [...this.projects, project];
        this.addProjectSnapshot(source);
        return cloneSnapshot(source) as T;
      }
      case 'inspect_data_sources':
        return this.inspectDataSources<T>(
          String(args.projectId ?? ''),
          Array.isArray(args.paths) ? args.paths.map(String) : [],
        );
      case 'register_datasets':
      case 'confirm_data_import':
        return this.confirmDataImport<T>(args);
      case 'submit_agent_intent':
      case 'submit_research_intent':
        return this.submitIntent<T>(args);
      case 'cancel_agent':
        this.canceledAgents.add(String(args.requestId ?? ''));
        return undefined as T;
      case 'refresh_provider_models':
        return ['browser-debug-model'] as T;
      case 'confirm_task_plan':
        return this.confirmTaskPlan<T>(String(args.planId ?? ''));
      case 'start_task_plan_run':
        return this.startTaskPlanRun<T>(String(args.planId ?? ''));
      case 'cancel_workflow':
        return this.cancelWorkflow<T>(String(args.runId ?? ''));
      case 'get_workspace_snapshot':
        return cloneSnapshot(this.currentSnapshot) as T;
      case 'get_artifact_detail':
        throw new Error(`浏览器调试中没有 Artifact：${String(args.artifactId ?? '')}`);
      case 'list_workspace_files':
        return this.listWorkspaceFiles() as T;
      case 'read_workspace_file':
        return this.readWorkspaceFile(String(args.relativePath ?? '')) as T;
      case 'set_terminal_access':
        this.terminalAccess = Boolean(args.enabled);
        return undefined as T;
      case 'run_terminal_command':
        return this.runTerminalCommand(args) as T;
      case 'yolo_models':
        return [
          {
            id: 'yolov8n-coco',
            name: 'YOLOv8n COCO 通用检测（浏览器模拟）',
            available: true,
          },
        ] as T;
      case 'yolo_memory_gb':
        return 4 as T;
      case 'yolo_folder_images': {
        const folderPath = String(args.folderPath ?? '');
        return [...this.virtualFiles.values()]
          .filter((file) => file.path.startsWith(folderPath) && isImageName(file.name))
          .map((file) => file.path) as T;
      }
      case 'yolo_drop_images': {
        const paths = Array.isArray(args.paths) ? args.paths.map(String) : [];
        return paths.filter((path) => isImageName(fileName(path))) as T;
      }
      case 'yolo_export_csv':
        this.log(`已模拟导出 ${Array.isArray(args.rows) ? args.rows.length : 0} 条 CSV 结果`);
        return undefined as T;
      default:
        throw new Error(`BrowserDebugRuntime 未实现命令：${command}`);
    }
  }

  private async sendMessage<T>(conversationId: string, content: string, requestId: string) {
    const generation = this.generation;
    const source = cloneSnapshot(this.snapshots.get(conversationId) ?? this.currentSnapshot);
    const timestamp = nowIso();
    const messages: AgentMessage[] = content.match(/图片|图像|YOLO|识别|位置在/i)
      ? [
          { role: 'thinking', delta: '先确认图片输入，并把识别任务接入育种台。' },
          { role: 'text', delta: '我已将这批图片加入图片识别任务，右侧会逐张显示处理进度。' },
        ]
      : [
          { role: 'thinking', delta: '浏览器调试运行时正在验证前端状态流转。' },
          { role: 'text', delta: '已收到。你可以继续测试对话、项目、文件预览和任务计划。' },
        ];
    let assistantContent = '';
    let reasoning = '';
    for (const message of messages) {
      if (generation !== this.generation || this.canceledAgents.has(requestId)) {
        throw new Error('Agent 请求已取消');
      }
      await wait(DEBUG_AGENT_STEP_MS);
      if (generation !== this.generation || this.canceledAgents.has(requestId)) {
        throw new Error('Agent 请求已取消');
      }
      if (message.role === 'thinking') reasoning += message.delta;
      else assistantContent += message.delta;
      const event: RuntimeAgentReplyDelta = {
        eventType: 'agent.reply.delta',
        requestId,
        conversationId,
        kind: message.role,
        delta: message.delta,
      };
      this.emit('lian-agent-event', event);
      this.log(`Agent ${message.role === 'thinking' ? '思考' : '回复'}增量`);
    }
    if (generation !== this.generation || this.canceledAgents.has(requestId)) {
      throw new Error('Agent 请求已取消');
    }
    if (content.match(/图片|图像|YOLO|识别|位置在/i)) {
      const selected = [...this.virtualFiles.values()].filter((file) => isImageName(file.name));
      const files = selected.length ? selected : await this.presetImages();
      this.fileCounter += selected.length ? 0 : files.length;
      this.enqueueExternalInference(
        files.map((file) => file.path),
        'yolov8n-coco',
        conversationId,
      );
    }
    source.messages = [
      ...source.messages,
      {
        id: `${requestId}:user`,
        conversationId,
        taskPlanId: null,
        role: 'user',
        content,
        createdAt: timestamp,
      },
      {
        id: `${requestId}:assistant`,
        conversationId,
        taskPlanId: null,
        role: 'assistant',
        content: assistantContent,
        reasoning,
        createdAt: nowIso(),
      },
    ];
    source.conversation.updatedAt = nowIso();
    this.updateSnapshot(source);
    return cloneSnapshot(source) as T;
  }

  private inspectDataSources<T>(projectId: string, paths: string[]) {
    const candidates = paths.map((path, index) => {
      const name = fileName(path);
      const supported = isDataName(name);
      return {
        sourceId: `browser-source-${this.generation}-${index}`,
        name,
        format: extensionOf(name).toUpperCase(),
        size: this.virtualFiles.get(path)?.size ?? 1024,
        checksum: `browser-debug-checksum-${index}`,
        sheets: extensionOf(name) === 'xlsx' ? ['Sheet1'] : [],
        rowCount: 148,
        columns: ['材料', '环境', '株高'],
        inferredMapping: {
          material: { source: '材料', target: 'material' },
          environment: { source: '环境', target: 'environment' },
          trait: { source: '株高', target: 'height' },
        },
        traits: ['株高'],
        ambiguities: [],
        supported,
        materialValues: ['A001', 'A002'],
        environmentValues: ['E1', 'E2'],
      };
    });
    const inspection: ImportInspection = {
      projectId,
      importSessionId: `browser-import-${this.generation}-${Date.now()}`,
      candidates,
    };
    this.emit('lian-import-event', {
      eventId: `browser-import-event-${Date.now()}`,
      projectId,
      taskId: null,
      runId: null,
      timestamp: nowIso(),
      eventType: 'import.inspected',
      payload: { count: candidates.length },
    });
    return inspection as T;
  }

  private confirmDataImport<T>(args: Record<string, unknown>) {
    const projectId = String(args.projectId ?? this.currentSnapshot.project?.id ?? 'browser-debug-project');
    const source = cloneSnapshot(this.currentSnapshot);
    const project = source.project ?? makeProject(projectId, '浏览器调试育种项目');
    source.project = project;
    source.conversation.projectId = project.id;
    const dataset = makeDataset(
      project.id,
      `browser-debug-dataset-${Date.now()}`,
      '浏览器导入数据.csv',
    );
    source.datasets = [...source.datasets, dataset];
    this.projects = this.projects.some((item) => item.id === project.id)
      ? this.projects
      : [...this.projects, project];
    this.addProjectSnapshot(source);
    return [dataset] as T;
  }

  private submitIntent<T>(args: Record<string, unknown>) {
    const source = cloneSnapshot(this.currentSnapshot);
    const projectId = String(args.projectId ?? source.project?.id ?? 'browser-debug-project');
    const inputList = Array.isArray(args.inputs)
      ? args.inputs as Array<{ id?: unknown }>
      : [];
    const datasetId = Array.isArray(args.datasetIds)
      ? String(args.datasetIds[0] ?? 'browser-debug-dataset')
      : String(inputList[0]?.id ?? 'browser-debug-dataset');
    const intent = String(args.intent ?? '浏览器调试分析');
    const plan = makeTaskPlan(projectId, datasetId, intent);
    source.taskPlans = [plan, ...source.taskPlans];
    this.updateSnapshot(source);
    this.emit('lian-agent-event', {
      eventType: 'agent.reply.delta',
      requestId: String(args.requestId ?? `debug-request-${Date.now()}`),
      conversationId: String(args.conversationId ?? source.conversation.id),
      kind: 'text',
      delta: '已生成浏览器模拟任务计划，请在育种台中确认。',
    });
    return plan as T;
  }

  private confirmTaskPlan<T>(planId: string) {
    const source = cloneSnapshot(this.currentSnapshot);
    const plan = source.taskPlans.find((item) => item.id === planId);
    if (!plan) throw new Error('任务计划不存在');
    plan.status = 'confirmed';
    const run = makeWorkflowRun(plan.projectId, plan.id, 'queued');
    source.workflowRuns = [run, ...source.workflowRuns];
    this.updateSnapshot(source);
    this.emit('lian-workflow-event', {
      eventId: `browser-workflow-${Date.now()}`,
      projectId: plan.projectId,
      taskId: plan.id,
      runId: run.id,
      timestamp: nowIso(),
      eventType: 'workflow.started',
      payload: { runtime: 'browser-debug' },
    });
    return run as T;
  }

  private startTaskPlanRun<T>(planId: string) {
    const source = cloneSnapshot(this.currentSnapshot);
    const run = source.workflowRuns.find((item) => item.taskPlanId === planId);

    if (!run) throw new Error('任务运行记录不存在');
    run.status = 'running';
    run.startedAt = nowIso();
    this.updateSnapshot(source);
    const timer = window.setTimeout(() => {
      const latest = cloneSnapshot(
        this.snapshots.get(source.conversation.id) ?? source,
      );
      const latestRun = latest.workflowRuns.find((item) => item.id === run.id);
      if (!latestRun || latestRun.status === 'cancelled') return;
      latestRun.status = 'succeeded';
      latestRun.finishedAt = nowIso();
      this.updateSnapshot(latest);
      this.emit('lian-workflow-event', {
        eventId: `browser-workflow-${Date.now()}`,
        projectId: run.projectId,
        taskId: planId,
        runId: run.id,
        timestamp: nowIso(),
        eventType: 'workflow.succeeded',
        payload: { runtime: 'browser-debug' },
      });
      this.workflowTimers.delete(run.id);
    }, DEBUG_WORKFLOW_DELAY_MS);
    this.workflowTimers.set(run.id, timer);
    return run as T;
  }

  private cancelWorkflow<T>(runId: string) {
    const source = cloneSnapshot(this.currentSnapshot);
    const run = source.workflowRuns.find((item) => item.id === runId);
    if (!run) return undefined as T;
    const timer = this.workflowTimers.get(runId);
    if (timer !== undefined) window.clearTimeout(timer);
    this.workflowTimers.delete(runId);
    run.status = 'cancelled';
    run.finishedAt = nowIso();
    this.updateSnapshot(source);
    this.emit('lian-workflow-event', {
      eventId: `browser-workflow-${Date.now()}`,
      projectId: run.projectId,
      taskId: run.taskPlanId,
      runId,
      timestamp: nowIso(),
      eventType: 'workflow.cancelled',
      payload: { runtime: 'browser-debug' },
    });
    return undefined as T;
  }

  private listWorkspaceFiles(): WorkspaceFileNode {
    const tree = createBrowserPreviewFileTree();
    const textFiles = [...this.virtualFiles.values()].filter((file) => !isImageName(file.name));
    if (!textFiles.length) return tree;
    const uploads: WorkspaceFileNode = {
      name: 'uploads',
      relativePath: 'uploads',
      directory: true,
      children: textFiles.map((file) => ({
        name: file.name,
        relativePath: `uploads/${file.name}`,
        directory: false,
        children: [],
      })),
    };
    return { ...tree, children: [...tree.children, uploads] };
  }

  private async readWorkspaceFile(relativePath: string): Promise<WorkspaceFilePreview> {
    const normalized = relativePath.replace(/^\/+/, '').replace(/\\/g, '/');
    if (normalized.startsWith('uploads/')) {
      const file = [...this.virtualFiles.values()].find((item) => item.name === normalized.slice('uploads/'.length));
      if (file?.file) {
        const content = await file.file.text();
        return {
          name: file.name,
          relativePath: normalized,
          kind: extensionOf(file.name) === 'md' ? 'markdown' : 'code',
          language: extensionOf(file.name) === 'md' ? 'markdown' : extensionOf(file.name) || 'plaintext',
          content,
        };
      }
    }
    return createBrowserPreviewFile(normalized);
  }

  private runTerminalCommand(args: Record<string, unknown>): TerminalRunResult {
    const request = args.request;
    const command = typeof request === 'object' && request !== null && 'command' in request
      ? String(request.command)
      : String(args.command ?? '');
    const common = {
      truncated: false,
      durationMs: 3,
      cwd: '/workspace/pod-agent',
    };
    if (!this.terminalAccess) {
      return {
        ...common,
        stdout: '',
        stderr: '终端访问未开启。',
        status: 126,
        success: false,
      };
    }
    if (command === 'pwd') {
      return { ...common, stdout: '/workspace/pod-agent\n', stderr: '', status: 0, success: true };
    }
    if (command === 'ls') {
      return { ...common, stdout: 'AGENTS.md\napp\ndocs\ntests\nenvironment.yml\n', stderr: '', status: 0, success: true };
    }
    if (command === 'git status' || command === 'git status --short') {
      return {
        ...common,
        stdout: 'On branch browser-debug\n工作区为浏览器内存模拟，没有真实 Git 改动。\n',
        stderr: '',
        status: 0,
        success: true,
      };
    }
    return {
      ...common,
      stdout: '',
      stderr: `浏览器调试终端不执行命令：${command}`,
      status: 127,
      success: false,
    };
  }

  async pickFiles(options: RuntimePickOptions) {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = options.directory ? true : options.multiple ?? true;
    if (options.directory) input.setAttribute('webkitdirectory', '');
    if (options.accept?.length) input.accept = options.accept.map((item) => `.${item.replace(/^\./, '')}`).join(',');
    const files = await new Promise<File[]>((resolve) => {
      input.addEventListener('change', () => resolve(Array.from(input.files ?? [])), { once: true });
      input.click();
    });
    input.remove();
    return files.map((file) => this.registerBrowserFile(file));
  }

  private registerBrowserFile(file: File) {
    const path = `browser-debug://uploads/${++this.fileCounter}/${file.name}`;
    const runtimeFile: RuntimeFile = {
      path,
      name: file.name,
      size: file.size,
      type: file.type || mimeTypeOf(file.name),
      file,
    };
    this.virtualFiles.set(path, runtimeFile);
    this.notifyDebug();
    return runtimeFile;
  }

  subscribeDrop(callback: (event: RuntimeDropEvent) => void) {
    const emitDragEvent = (event: DragEvent, type: RuntimeDropEvent['type']) => {
      event.preventDefault();
      const files = type === 'drop'
        ? Array.from(event.dataTransfer?.files ?? []).map((file) => this.registerBrowserFile(file))
        : [];
      callback({ type, files, position: { x: event.clientX, y: event.clientY } });
    };
    const onDragEnter = (event: DragEvent) => emitDragEvent(event, 'enter');
    const onDragOver = (event: DragEvent) => emitDragEvent(event, 'over');
    const onDrop = (event: DragEvent) => emitDragEvent(event, 'drop');
    const onDragLeave = (event: DragEvent) => emitDragEvent(event, 'leave');
    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);
    document.addEventListener('dragleave', onDragLeave);
    return Promise.resolve(() => {
      document.removeEventListener('dragenter', onDragEnter);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('drop', onDrop);
      document.removeEventListener('dragleave', onDragLeave);
    });
  }

  async saveFile(options: RuntimeSaveOptions) {
    return `browser-debug://downloads/${options.defaultPath}`;
  }

  getNativeAssetUrl() {
    return undefined;
  }

  private async imageData(path: string): Promise<RuntimeImageData> {
    const file = this.virtualFiles.get(path)?.file;
    if (!file) throw new Error(`浏览器调试找不到图片：${path}`);
    return {
      bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
      mimeType: file.type || mimeTypeOf(file.name),
    };
  }

  readThumbnail(path: string) {
    return this.imageData(path);
  }

  readImagePreview(path: string) {
    return this.imageData(path);
  }

  async readResultPreview(path: string, detections: RuntimeYoloDetection[]) {
    const original = await this.imageData(path);
    const content = makeImageResultSvg(original, detections);
    return {
      bytes: bytesFromString(content),
      mimeType: 'image/svg+xml',
    };
  }

  detectImages(
    modelId: string,
    imagePaths: string[],
    onItem: (item: RuntimeYoloProgressItem) => void,
  ) {
    // 调用方按 Batch=8 分批提交；运行时负责把每一张都放入当前代次队列，不能截断尾部图片。
    return this.queueInference(modelId, imagePaths, onItem);
  }
}
