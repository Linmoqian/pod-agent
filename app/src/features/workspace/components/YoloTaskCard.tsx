/* 图片推理队列与完成归档动效。
 * Created on 2026-09-15
 * Updated on 2026-09-17
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { isYoloDropTarget } from '../hooks/yoloDropTarget';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, CircleAlert, CircleCheck, Clock3, FolderPlus, Images, Pause, Play, Plus, RotateCcw, ScanLine, X } from 'lucide-react';
import {
  getFrontendRuntime,
  isBrowserPreviewRuntime,
} from '../../../services/runtime';
import type { WorkbenchModuleDensity } from '../../../layouts/panelLayout';
import type {
  RuntimeDropEvent,
  RuntimeFile,
  RuntimeYoloDetection,
  RuntimeYoloEvent,
  RuntimeYoloModel,
  RuntimeYoloResponse,
} from '../../../services/runtime';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import styles from './YoloTaskCard.module.css';

export type YoloDetection = RuntimeYoloDetection;

export type YoloPhoto = {
  id: string;
  path: string;
  name: string;
  url?: string;
  previewUrl?: string;
  previewSource?: 'native' | 'decoded';
  resultUrl?: string;
  external?: boolean;
  modelId?: string;
  status: 'loading' | 'waiting' | 'running' | 'done' | 'error';
  startedAt?: number;
  finishedAt?: number;
  message?: string;
  count?: number;
  counts?: Record<string, number>;
  detections?: YoloDetection[];
};
export type ImagePreviewOptions = { forceFallback?: boolean };
type Model = RuntimeYoloModel;
type YoloEvent = RuntimeYoloEvent;
type YoloResponse = RuntimeYoloResponse;

type ResultReveal = {
  photoId: string;
  path: string;
  result: YoloResponse;
  conversationId: string;
};

type NavigatorWithMemory = Navigator & {
  deviceMemory?: number;
};

type PerformanceWithMemory = Performance & {
  memory?: {
    jsHeapSizeLimit?: number;
  };
};

type ImageReadPlan = {
  concurrency: number;
  previewLimit: number;
  appendChunkSize: number;
  inferenceBatchSize: number;
};

type ThumbnailJob = {
  id: string;
  path: string;
  external: boolean;
  conversationId: string;
};

type YoloTaskSession = {
  photos: YoloPhoto[];
  modelId: string;
  paused: boolean;
};

type AddConfirmationRequest = {
  count: number;
  resolve: (accepted: boolean) => void;
};

function resultRevealDelay(queueLength: number) {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
  if (queueLength > 96) return 16;
  if (queueLength > 24) return 32;
  return 64;
}

function waitForResultReveal(delay: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, delay));
}

function getImageReadPlan(memoryOverride?: number): ImageReadPlan {
  const browserNavigator = typeof navigator === 'undefined'
    ? undefined
    : navigator as NavigatorWithMemory;
  const reportedMemory = Number(browserNavigator?.deviceMemory);
  const heapLimit = typeof performance === 'undefined'
    ? undefined
    : (performance as PerformanceWithMemory).memory?.jsHeapSizeLimit;
  const heapMemory = heapLimit && heapLimit > 0
    ? heapLimit / (1024 ** 3)
    : undefined;
  const overrideMemory = typeof memoryOverride === 'number' && Number.isFinite(memoryOverride) && memoryOverride > 0
    ? memoryOverride
    : undefined;
  const memoryGb = overrideMemory
    ?? (Number.isFinite(reportedMemory) && reportedMemory > 0 ? reportedMemory : heapMemory ?? 4);
  const safeMemoryGb = Math.max(1, Math.min(64, memoryGb));
  const cpuCount = Math.max(1, browserNavigator?.hardwareConcurrency ?? 4);
  const memoryConcurrency = safeMemoryGb <= 2 ? 1 : safeMemoryGb <= 4 ? 2 : safeMemoryGb <= 8 ? 3 : 4;

  return {
    concurrency: Math.max(1, Math.min(memoryConcurrency, Math.max(1, cpuCount - 1))),
    previewLimit: safeMemoryGb <= 4 ? 8 : safeMemoryGb <= 8 ? 16 : 32,
    appendChunkSize: safeMemoryGb <= 4 ? 64 : safeMemoryGb <= 8 ? 128 : 256,
    // 以吞吐为目标，让 Rust 端优先走真正的动态 Batch；静态 Batch=1 权重会在后端自动回退。
    inferenceBatchSize: safeMemoryGb <= 4 ? 8 : safeMemoryGb <= 8 ? 16 : safeMemoryGb <= 16 ? 32 : 64,
  };
}

function isImagePath(path: string) {
  return /\.(?:jpe?g|png)$/i.test(path);
}

function yieldToUi() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

export function useYoloToolEvents(onEvent: (event: YoloEvent) => void) {
  const callback = useRef(onEvent);
  callback.current = onEvent;
  useEffect(() => {
    const runtime = getFrontendRuntime();
    if (runtime.mode === 'browser-preview') return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void runtime.listen('lian-yolo-event', (payload) => {
      if (!disposed && typeof payload.id === 'string' && ['queued', 'running', 'done', 'error'].includes(payload.status)) callback.current(payload);
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; }).catch(() => {});
    return () => { disposed = true; unlisten?.(); };
  }, []);
}

export function useYoloTask(conversationId = 'global') {
  const runtime = getFrontendRuntime();
  const [photos, setPhotos] = useState<YoloPhoto[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [modelId, setModelIdState] = useState('');
  const [paused, setPausedState] = useState(false);
  const [addingCount, setAddingCount] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [addConfirmation, setAddConfirmation] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const activeSessions = useRef(new Set<string>());
  const mounted = useRef(true);
  const activeConversationId = useRef(conversationId);
  const sessions = useRef(new Map<string, YoloTaskSession>());
  const urls = useRef<string[]>([]);
  const externalIds = useRef(new Set<string>());
  const thumbnailQueue = useRef<ThumbnailJob[]>([]);
  const activeThumbnailReads = useRef(0);
  const retainedPreviewCount = useRef(0);
  const reservedPreviewCount = useRef(0);
  const runtimeMemoryGb = useRef<number | undefined>(undefined);
  const photosRef = useRef<YoloPhoto[]>([]);
  const thumbnailUrls = useRef(new Map<string, string>());
  const thumbnailScheduledIds = useRef(new Set<string>());
  const thumbnailPromises = useRef(new Map<string, Promise<void>>());
  const thumbnailResolvers = useRef(new Map<string, () => void>());
  const thumbnailFocusId = useRef<string | null>(null);
  const thumbnailGeneration = useRef(0);
  const addConfirmationQueue = useRef<AddConfirmationRequest[]>([]);
  const resultRevealQueue = useRef<ResultReveal[]>([]);
  const revealingResults = useRef(false);
  const pausedRef = useRef(false);
  photosRef.current = photos;

  const ensureSession = (id: string) => {
    const existing = sessions.current.get(id);
    if (existing) return existing;
    const created: YoloTaskSession = { photos: [], modelId: '', paused: false };
    sessions.current.set(id, created);
    return created;
  };

  const updateSessionPhotos = (
    id: string,
    update: (current: YoloPhoto[]) => YoloPhoto[],
  ) => {
    const session = ensureSession(id);
    const next = update(session.photos);
    session.photos = next;
    if (activeConversationId.current === id) {
      photosRef.current = next;
      setPhotos(next);
    }
  };

  const setModelId = (next: string) => {
    ensureSession(activeConversationId.current).modelId = next;
    setModelIdState(next);
  };

  useEffect(() => {
    activeConversationId.current = conversationId;
    const session = ensureSession(conversationId);
    setPhotos(session.photos);
    photosRef.current = session.photos;
    pausedRef.current = session.paused;
    setPausedState(session.paused);
    setModelIdState(session.modelId || models.find((model) => model.available)?.id || '');
  }, [conversationId, models]);

  // 桌面端在批次边界暂停；浏览器调试运行时可在模拟队列中暂停下一张。
  const setPaused = (next: boolean) => {
    const session = ensureSession(activeConversationId.current);
    session.paused = next;
    pausedRef.current = next;
    setPausedState(next);
    runtime.debug?.setInferencePaused(next);
  };

  const requestAddConfirmation = (count: number) => new Promise<boolean>((resolve) => {
    addConfirmationQueue.current.push({ count, resolve });
    setAddConfirmation((current) => current ?? count);
  });

  const resolveAddConfirmation = (accepted: boolean) => {
    const request = addConfirmationQueue.current.shift();
    request?.resolve(accepted);
    setAddConfirmation(addConfirmationQueue.current[0]?.count ?? null);
  };

  const readThumbnail = async (job: ThumbnailJob) => {
    const generation = thumbnailGeneration.current;
    const targetSession = ensureSession(job.conversationId);
    try {
      const image = await runtime.readThumbnail(job.path);
      if (!mounted.current || generation !== thumbnailGeneration.current) return;
      const previewLimit = getImageReadPlan(runtimeMemoryGb.current).previewLimit;
      const protectedIds = new Set([
        thumbnailFocusId.current,
        ...targetSession.photos.filter((photo) => photo.status === 'done').slice(-3).map((photo) => photo.id),
        ...targetSession.photos.filter((photo) => photo.status === 'running').slice(0, 3).map((photo) => photo.id),
      ]);
      const shouldEvict = thumbnailUrls.current.size >= previewLimit;
      const oldest = shouldEvict
        ? [...thumbnailUrls.current.keys()].find((id) => !protectedIds.has(id))
        : undefined;
      // 只淘汰缓存索引，不撤销已经显示的 Object URL；否则结果列表会立刻重读同一张图并闪烁。
      if (typeof oldest === 'string') thumbnailUrls.current.delete(oldest);
      const url = URL.createObjectURL(new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }));
      thumbnailUrls.current.set(job.id, url);
      retainedPreviewCount.current = thumbnailUrls.current.size;
      urls.current.push(url);
      updateSessionPhotos(job.conversationId, (list) => list.map((photo) => {
        if (photo.id !== job.id) return photo;
        return { ...photo, url };
      }));
    } catch {
      // 缩略图只是展示层资源；即使它失败，也不能阻塞或移除真实推理任务。
      thumbnailScheduledIds.current.delete(job.id);
    } finally {
      thumbnailResolvers.current.get(job.id)?.();
      thumbnailResolvers.current.delete(job.id);
      thumbnailPromises.current.delete(job.id);
      if (mounted.current) {
        reservedPreviewCount.current = Math.max(0, reservedPreviewCount.current - 1);
      }
    }
  };

  const pumpThumbnailReads = () => {
    const { concurrency } = getImageReadPlan(runtimeMemoryGb.current);
    while (mounted.current && activeThumbnailReads.current < concurrency && thumbnailQueue.current.length) {
      const job = thumbnailQueue.current.shift();
      if (!job) break;
      activeThumbnailReads.current += 1;
      void readThumbnail(job)
        .catch(() => {})
        .finally(() => {
          activeThumbnailReads.current -= 1;
          pumpThumbnailReads();
        });
    }
  };

  const enqueueThumbnailReads = (jobs: ThumbnailJob[], prioritize = false) => {
    if (!jobs.length) return;
    const previewLimit = getImageReadPlan(runtimeMemoryGb.current).previewLimit;
    const available = Math.max(
      0,
      previewLimit - retainedPreviewCount.current - reservedPreviewCount.current,
    );
    const pending = jobs.filter((job) => {
      const inFlight = thumbnailPromises.current.has(job.id);
      // 成功读取后即使缓存索引被淘汰，photo.url 仍在界面上使用，不能再次读取造成闪烁。
      return !inFlight && !thumbnailScheduledIds.current.has(job.id);
    });
    const selected = prioritize ? pending : pending.slice(0, available);
    if (!selected.length) return;
    reservedPreviewCount.current += selected.length;
    selected.forEach((job) => {
      thumbnailScheduledIds.current.add(job.id);
      thumbnailPromises.current.set(job.id, new Promise<void>((resolve) => {
        thumbnailResolvers.current.set(job.id, resolve);
      }));
    });
    if (prioritize) thumbnailQueue.current.unshift(...selected);
    else thumbnailQueue.current.push(...selected);
    pumpThumbnailReads();
  };

  const ensureThumbnail = async (job: ThumbnailJob) => {
    if (ensureSession(job.conversationId).photos.some((photo) => photo.id === job.id && photo.url)) return;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (thumbnailUrls.current.has(job.id)) return;
      enqueueThumbnailReads([job], true);
      const pending = thumbnailPromises.current.get(job.id);
      if (pending) await pending;
    }
  };

  const loadThumbnail = async (photo: YoloPhoto) => {
    const cached = thumbnailUrls.current.get(photo.id);
    if (cached) return cached;
    if (runtime.mode === 'browser-preview') return undefined;
    await ensureThumbnail({
      id: photo.id,
      path: photo.path,
      external: Boolean(photo.external),
      conversationId: activeConversationId.current,
    });
    const url = thumbnailUrls.current.get(photo.id);
    if (!url) throw new Error('缩略图加载失败');
    return url;
  };

  const loadRuntimeMemory = async () => {
    if (runtimeMemoryGb.current !== undefined || runtime.mode === 'browser-preview') return;
    try {
      const memoryGb = await runtime.invoke<number>('yolo_memory_gb');
      if (Number.isFinite(memoryGb) && memoryGb > 0) runtimeMemoryGb.current = memoryGb;
    } catch {
      // 系统内存不可读时使用 WebView 报告值或保守默认值。
    }
  };

  const revealNextResults = async () => {
    if (revealingResults.current) return;
    revealingResults.current = true;
    const generation = thumbnailGeneration.current;
    try {
      while (
        mounted.current &&
        generation === thumbnailGeneration.current &&
        resultRevealQueue.current.length
      ) {
        const next = resultRevealQueue.current.shift();
        if (!next) continue;
        thumbnailFocusId.current = next.photoId;
        try {
          await ensureThumbnail({
            id: next.photoId,
            path: next.path,
            external: false,
            conversationId: next.conversationId,
          });
        } finally {
          thumbnailFocusId.current = null;
        }
        if (!mounted.current || generation !== thumbnailGeneration.current) return;
        const finishedAt = Date.now();
        updateSessionPhotos(next.conversationId, (list) => list.map((photo) => {
          if (photo.id !== next.photoId) return photo;
          if (!next.result.ok) return {
            ...photo,
            status: 'error',
            finishedAt,
            message: next.result.message || '推理失败',
          };
          return {
            ...photo,
            status: 'done',
            finishedAt,
            message: next.result.message,
            count: next.result.count,
            counts: next.result.counts,
            detections: next.result.detections,
          };
        }));
        if (generation === thumbnailGeneration.current && resultRevealQueue.current.length) {
          await waitForResultReveal(resultRevealDelay(resultRevealQueue.current.length));
        }
      }
    } finally {
      revealingResults.current = false;
      if (mounted.current && resultRevealQueue.current.length) void revealNextResults();
    }
  };

  const enqueueResultReveals = (results: ResultReveal[]) => {
    if (!results.length) return;
    resultRevealQueue.current.push(...results);
    void revealNextResults();
  };

  useYoloToolEvents((event) => {
    const targetConversationId = event.conversationId ?? activeConversationId.current;
    const path = event.imagePath;
    if (path) {
      const isNew = !externalIds.current.has(event.id);
      const terminal = event.status === 'done' || event.status === 'error';
      const status = event.status === 'queued' ? 'waiting' : event.status;
      if (isNew) {
        externalIds.current.add(event.id);
        const now = Date.now();
        updateSessionPhotos(targetConversationId, (list) => list.some((p) => p.id === event.id) ? list : [...list, {
          id: event.id,
          path,
          name: path.split(/[/\\]/).pop() ?? path,
          status,
          startedAt: event.status === 'queued' ? undefined : now,
          finishedAt: terminal ? now : undefined,
          external: true,
          modelId: event.modelId,
          message: event.message,
          count: event.count,
          counts: event.counts,
          detections: event.detections,
        }]);
      } else {
        updateSessionPhotos(targetConversationId, (list) => list.map((p) => p.id === event.id ? {
          ...p,
          status,
          startedAt: event.status === 'queued'
            ? undefined
            : event.status === 'running' ? p.startedAt ?? Date.now() : p.startedAt,
          finishedAt: event.status === 'queued'
            ? undefined
            : terminal ? p.finishedAt ?? Date.now() : p.finishedAt,
          message: event.status === 'queued' ? undefined : event.message ?? p.message,
          count: event.status === 'queued' ? undefined : event.count ?? p.count,
          counts: event.status === 'queued' ? undefined : event.counts ?? p.counts,
          detections: event.status === 'queued' ? undefined : event.detections ?? p.detections,
        } : p));
      }
      if (event.status === 'done') {
        enqueueThumbnailReads([{
          id: event.id,
          path,
          external: true,
          conversationId: targetConversationId,
        }], true);
      } else if (isNew) {
        enqueueThumbnailReads([{
          id: event.id,
          path,
          external: true,
          conversationId: targetConversationId,
        }]);
      }
      return;
    }
    if (event.status === 'queued') return;
    const status = event.status === 'done' || event.status === 'error' ? event.status : 'running';
    updateSessionPhotos(targetConversationId, (list) => list.map((p) => p.id === event.id ? {
      ...p,
      status,
      finishedAt: event.status === 'done' || event.status === 'error' ? Date.now() : p.finishedAt,
      message: event.message ?? p.message,
      count: event.count ?? p.count,
      counts: event.counts ?? p.counts,
      detections: event.detections ?? p.detections,
    } : p));
  });
  useEffect(() => {
    const objectUrls = urls.current;
    const thumbnailUrlCache = thumbnailUrls.current;
    const scheduledThumbnailIds = thumbnailScheduledIds.current;
    const thumbnailPromiseCache = thumbnailPromises.current;
    const thumbnailResolverCache = thumbnailResolvers.current;
    const addConfirmationQueueCache = addConfirmationQueue.current;
    mounted.current = true;
    if (runtime.mode !== 'browser-preview') void runtime.invoke<Model[]>('yolo_models').then((list) => {
      if (!mounted.current) return;
      const nextModelId = list.find((model) => model.available)?.id ?? '';
      setModels(list);
      const session = ensureSession(activeConversationId.current);
      if (!session.modelId) session.modelId = nextModelId;
      setModelIdState(session.modelId || nextModelId);
    }).catch(() => setError('模型清单加载失败'));
    let debugUnlisten: (() => void) | undefined;
    let debugStateUnsubscribe: (() => void) | undefined;
    if (runtime.mode === 'browser-debug') {
      const syncDebugState = () => {
        const nextPaused = runtime.debug?.getState().paused ?? false;
        ensureSession(activeConversationId.current).paused = nextPaused;
        pausedRef.current = nextPaused;
        setPausedState(nextPaused);
      };
      syncDebugState();
      debugStateUnsubscribe = runtime.debug?.subscribe(syncDebugState);
      void runtime.listen('lian-debug-event', (event) => {
        if (event.type !== 'reset' || !mounted.current) return;
        urls.current.forEach((url) => URL.revokeObjectURL(url));
        urls.current = [];
        thumbnailUrls.current.clear();
        thumbnailGeneration.current += 1;
        thumbnailQueue.current = [];
        thumbnailScheduledIds.current.clear();
        thumbnailResolverCache.forEach((resolve) => resolve());
        thumbnailResolvers.current.clear();
        thumbnailPromises.current.clear();
        retainedPreviewCount.current = 0;
        reservedPreviewCount.current = 0;
        thumbnailFocusId.current = null;
        externalIds.current.clear();
        sessions.current.clear();
        ensureSession(activeConversationId.current);
        activeSessions.current.clear();
        resultRevealQueue.current = [];
        addConfirmationQueue.current.splice(0).forEach(({ resolve }) => resolve(false));
        setAddConfirmation(null);
        setAddingCount(0);
        pausedRef.current = false;
        setPausedState(false);
        setPhotos([]);
        setError('');
        setRevision((value) => value + 1);
      }).then((stop) => {
        if (!mounted.current) stop();
        else debugUnlisten = stop;
      }).catch(() => {});
    }
    return () => {
      mounted.current = false;
      thumbnailGeneration.current += 1;
      debugUnlisten?.();
      debugStateUnsubscribe?.();
      thumbnailQueue.current = [];
      thumbnailUrlCache.clear();
      scheduledThumbnailIds.clear();
      thumbnailResolverCache.forEach((resolve) => resolve());
      thumbnailPromiseCache.clear();
      thumbnailResolverCache.clear();
      addConfirmationQueueCache.splice(0).forEach(({ resolve }) => resolve(false));
      resultRevealQueue.current = [];
      reservedPreviewCount.current = 0;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [runtime]);

  const appendBatch = (
    batch: YoloPhoto[],
    targetConversationId: string,
    generation: number,
  ) => {
    const { appendChunkSize } = getImageReadPlan(runtimeMemoryGb.current);
    let offset = 0;
    const appendNext = () => {
      if (
        !mounted.current ||
        generation !== thumbnailGeneration.current ||
        offset >= batch.length
      ) return;
      const chunk = batch.slice(offset, offset + appendChunkSize);
      offset += chunk.length;
      updateSessionPhotos(targetConversationId, (list) => [...list, ...chunk]);
      // 预览只读取当前队列最前面的有限数量，其余图片直接进入推理队列。
      enqueueThumbnailReads(chunk.map((photo) => ({
        id: photo.id,
        path: photo.path,
        external: false,
        conversationId: targetConversationId,
      })));
      if (offset < batch.length) void yieldToUi().then(appendNext);
    };
    appendNext();
  };

  useEffect(() => {
    const targetConversationId = activeConversationId.current;
    const session = ensureSession(targetConversationId);
    const requestModelId = session.modelId || modelId;
    if (session.paused || pausedRef.current || activeSessions.current.has(targetConversationId) || !requestModelId) return;
    const batch = session.photos
      .filter((photo) => !photo.external && photo.status === 'waiting')
      .slice(0, getImageReadPlan(runtimeMemoryGb.current).inferenceBatchSize);
    if (!batch.length) return;
    // 当前 Batch 优先补齐系统缩略图，确保处理中卡片持续显示真实图片而不是占位图。
    enqueueThumbnailReads(
      batch.map((photo) => ({
        id: photo.id,
        path: photo.path,
        external: false,
        conversationId: targetConversationId,
      })),
      true,
    );
    const ids = new Set(batch.map((photo) => photo.id));
    const batchModelId = batch[0].modelId ?? requestModelId;
    const generation = thumbnailGeneration.current;
    activeSessions.current.add(targetConversationId);
    updateSessionPhotos(targetConversationId, (list) => list.map((p) => ids.has(p.id) ? {
      ...p,
      status: 'running',
      startedAt: Date.now(),
      finishedAt: undefined,
    } : p));
    void runtime.detectImages(
      batchModelId,
      batch.map((photo) => photo.path),
      (item) => {
        if (!mounted.current || generation !== thumbnailGeneration.current) return;
        const photo = batch[item.index];
        if (!photo) return;
        enqueueResultReveals([{
          photoId: photo.id,
          path: photo.path,
          result: item.result,
          conversationId: targetConversationId,
        }]);
      },
    ).catch((reason) => {
      if (!mounted.current || generation !== thumbnailGeneration.current) return;
      const message = reason instanceof Error ? reason.message : String(reason);
      enqueueResultReveals(batch.map((photo) => ({
        photoId: photo.id,
        path: photo.path,
        result: { ok: false, message },
        conversationId: targetConversationId,
      })));
    }).finally(() => {
      activeSessions.current.delete(targetConversationId);
      if (mounted.current && generation === thumbnailGeneration.current) {
        setRevision((value) => value + 1);
      }
    });
  // 推理控制函数只依赖 refs 与当前运行时；避免把每次渲染新建的 helper 放入依赖，重复启动批次。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, photos, paused, modelId, revision]);
  const add = async (folder = false, dropped?: Array<string | RuntimeFile>) => {
    const targetConversationId = activeConversationId.current;
    const targetModelId = ensureSession(targetConversationId).modelId || modelId;
    const generation = thumbnailGeneration.current;
    if (!targetModelId) { setError('请先选择可用的推理模型'); return; }
    setAddingCount((count) => count + 1);
    setError('');
    try {
      const selected = dropped ?? await runtime.pickFiles({
        directory: folder,
        multiple: !folder,
        accept: folder ? undefined : ['jpg', 'jpeg', 'png'],
      });
      const selectedPaths = selected.map((item) => typeof item === 'string' ? item : item.path);
      if (!selectedPaths.length) return;
      let paths: string[];
      if (dropped) {
        paths = runtime.mode === 'tauri'
          ? await runtime.invoke<string[]>('yolo_drop_images', { paths: selectedPaths })
          : selectedPaths.filter(isImagePath);
      } else if (folder && runtime.mode === 'tauri') {
        paths = await runtime.invoke<string[]>('yolo_folder_images', {
          folderPath: selectedPaths[0],
        });
      } else {
        paths = selectedPaths.filter(isImagePath);
      }
      if (!paths.length) { setError('文件夹中没有 JPG、JPEG 或 PNG 图片'); return; }
      const sourceIsFolder = folder || Boolean(dropped?.some((item) => {
        const name = typeof item === 'string' ? item : item.name;
        return !isImagePath(name);
      }));
      if (sourceIsFolder || paths.length >= 100) {
        const accepted = await requestAddConfirmation(paths.length);
        if (!accepted) return;
      }
      await loadRuntimeMemory();
      if (generation !== thumbnailGeneration.current) return;
      const batch = paths.map<YoloPhoto>((path) => ({
        id: crypto.randomUUID(),
        path,
        name: path.split(/[/\\]/).pop() ?? path,
        status: 'waiting',
        modelId: targetModelId,
      }));
      appendBatch(batch, targetConversationId, generation);
    } catch { setError('图片添加失败，请检查文件是否可读'); }
    finally { setAddingCount((count) => Math.max(0, count - 1)); }
  };
  const dropCallback = useRef(add);
  dropCallback.current = add;
  useEffect(() => {
    if (runtime.mode === 'browser-preview') return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const onDrop = (event: RuntimeDropEvent) => {
      if (disposed) return;
      if (event.type === 'leave') {
        setDragging(false);
        return;
      }
      const isTarget = Boolean(event.position && isYoloDropTarget(event.position));
      if (event.type === 'drop') {
        setDragging(false);
        if (isTarget && event.files.length) void dropCallback.current(false, event.files);
        return;
      }
      if (event.type === 'enter' || event.type === 'over') setDragging(isTarget);
    };
    void runtime.subscribeDrop(onDrop)
      .then((stop) => { if (disposed) stop(); else unlisten = stop; })
      .catch(() => setError('拖放监听失败，请使用添加按钮'));
    return () => { disposed = true; unlisten?.(); };
  }, [runtime]);
  const loadResultPreview = async (photo: YoloPhoto) => {
    if (photo.resultUrl) return photo.resultUrl;
    const targetConversationId = activeConversationId.current;
    const image = await runtime.readResultPreview(photo.path, photo.detections ?? []);
    const resultUrl = URL.createObjectURL(new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }));
    urls.current.push(resultUrl);
    updateSessionPhotos(targetConversationId, (list) => list.map((item) => item.id === photo.id ? { ...item, resultUrl } : item));
    return resultUrl;
  };
  const loadImagePreview = async (photo: YoloPhoto, options: ImagePreviewOptions = {}) => {
    const targetConversationId = activeConversationId.current;
    const forceFallback = options.forceFallback === true;
    if (!forceFallback && photo.previewUrl) return photo.previewUrl;
    if (!forceFallback && runtime.mode === 'tauri') {
      try {
        await runtime.invoke('yolo_prepare_image_preview', { imagePath: photo.path });
        const nativeUrl = runtime.getNativeAssetUrl(photo.path);
        if (nativeUrl) {
          updateSessionPhotos(targetConversationId, (list) => list.map((item) => item.id === photo.id
            ? { ...item, previewUrl: nativeUrl, previewSource: 'native' }
            : item));
          return nativeUrl;
        }
      } catch {
        // 资产协议不可用时继续走现有解码链路，避免原图预览中断。
      }
    }
    updateSessionPhotos(targetConversationId, (list) => list.map((item) => item.id === photo.id
      ? { ...item, previewUrl: undefined, previewSource: undefined }
      : item));
    const image = await runtime.readImagePreview(photo.path);
    const previewUrl = URL.createObjectURL(new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }));
    urls.current.push(previewUrl);
    updateSessionPhotos(targetConversationId, (list) => list.map((item) => item.id === photo.id
      ? { ...item, previewUrl, previewSource: 'decoded' }
      : item));
    return previewUrl;
  };
  const exportCsv = async (rows: YoloPhoto[]) => {
    const outputPath = await runtime.saveFile({
      defaultPath: '图片识别结果.csv',
      extension: 'csv',
    });
    if (!outputPath) return;
    await runtime.invoke('yolo_export_csv', {
      outputPath,
      rows: rows.map((photo) => ({
        name: photo.name,
        path: photo.path,
        model: models.find((model) => model.id === photo.modelId)?.name ?? photo.modelId ?? '',
        status: photo.status,
        count: photo.count,
        counts: photo.counts ?? {},
        summary: photo.message ?? '',
      })),
    });
  };
  const retry = () => {
    const targetConversationId = activeConversationId.current;
    const session = ensureSession(targetConversationId);
    if (runtime.mode === 'browser-debug' && session.photos.some((photo) => photo.external && photo.status === 'error')) {
      runtime.debug?.retryFailedInference();
    }
    updateSessionPhotos(targetConversationId, (list) => list.map((p) => !p.external && p.status === 'error' ? {
      ...p,
      status: 'waiting',
      startedAt: undefined,
      finishedAt: undefined,
      message: undefined,
      count: undefined,
      counts: undefined,
      detections: undefined,
    } : p));
  };
  return { photos, models, modelId, setModelId, paused, setPaused, adding: addingCount > 0, dragging, error, add,
    addConfirmation, resolveAddConfirmation,
    loadThumbnail, loadResultPreview, loadImagePreview, exportCsv, retry };
}

export type YoloTask = ReturnType<typeof useYoloTask>;

export default function YoloTaskCard({
  task,
  onOpenResults,
  onClose,
  density = 'complex',
}: {
  task: YoloTask;
  onOpenResults: (photoId?: string) => void;
  onClose?: () => void;
  density?: WorkbenchModuleDensity;
}) {
  const reduced = useReducedMotion();
  const runtimeMode = getFrontendRuntime().mode;
  const { photos, paused } = task;
  const groups = useMemo(() => {
    const done: YoloPhoto[] = [];
    const loading: YoloPhoto[] = [];
    const waiting: YoloPhoto[] = [];
    const running: YoloPhoto[] = [];
    const failed: YoloPhoto[] = [];
    for (const photo of photos) {
      if (photo.status === 'done') done.push(photo);
      else if (photo.status === 'loading') loading.push(photo);
      else if (photo.status === 'waiting') waiting.push(photo);
      else if (photo.status === 'running') running.push(photo);
      else failed.push(photo);
    }
    const queued = [...loading, ...waiting, ...running];
    queued.sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running'));
    return { done, loading, waiting, running, failed, queued };
  }, [photos]);
  const { done, running: runningPhotos, failed, queued } = groups;
  const running = runningPhotos[0];
  const localQueued = queued.filter((photo) => !photo.external);
  const canPause = localQueued.length > 0 || (runtimeMode === 'browser-debug' && queued.length > 0);
  const reading = task.adding;
  const left = queued.slice(0, 3);
  const completedVisible = done.slice(-3);
  const visible = [...left, ...completedVisible];
  const status = running
    ? paused ? '当前图片完成后暂停' : '进行中'
    : reading
      ? '读取中'
      : paused && canPause
        ? '已暂停'
        : failed.length && queued.length
          ? '部分失败'
          : failed.length
            ? '已完成，含失败'
            : photos.length
              ? '已完成'
              : '等待图片';
  const StatusIcon = running
    ? ScanLine
    : reading
      ? ScanLine
      : failed.length
        ? CircleAlert
        : photos.length
          ? CircleCheck
          : Clock3;
  return <section className={styles.card} data-density={density} data-yolo-drop-target data-dragging={task.dragging} aria-label="图片推理任务">
    <Dialog
      open={task.addConfirmation !== null}
      onOpenChange={(open) => {
        if (!open) task.resolveAddConfirmation(false);
      }}
    >
      <DialogContent className={styles.addConfirmDialog}>
        <DialogHeader className={styles.addConfirmHeader}>
          <div className={styles.addConfirmIcon}><Images size={18} aria-hidden /></div>
          <DialogTitle className={styles.addConfirmTitle}>添加图片</DialogTitle>
          <DialogDescription className={styles.addConfirmDescription}>
            发现 {task.addConfirmation ?? 0} 张图片，是否加入图片识别队列？
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className={styles.addConfirmFooter}>
          <Button variant="outline" onClick={() => task.resolveAddConfirmation(false)}>取消</Button>
          <Button onClick={() => task.resolveAddConfirmation(true)}>加入队列</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <header>
      <strong><ScanLine size={15} aria-hidden />图片识别</strong>
      <div className={styles.headerActions}>
        <button type="button" className={styles.resultStatus} title="打开图片识别结果" aria-label={`打开图片识别结果，当前状态：${status}`} onClick={() => onOpenResults()}><StatusIcon size={13} aria-hidden />{status}<ArrowUpRight size={12} aria-hidden /></button>
        {onClose && <button type="button" className={styles.closeButton} title="关闭图片识别模块" aria-label="关闭图片识别模块" onClick={onClose}><X size={14} aria-hidden /></button>}
      </div>
    </header>
    <Select
      value={task.modelId || undefined}
      onValueChange={task.setModelId}
      disabled={queued.length > 0 || task.models.length === 0}
    >
      <SelectTrigger className={styles.modelSelect} size="sm" aria-label="推理模型">
        <SelectValue placeholder={task.models.length
          ? '选择推理模型'
          : runtimeMode === 'tauri'
            ? '暂无模型'
            : runtimeMode === 'browser-debug'
              ? '浏览器模拟模型'
              : '桌面端可用'} />
      </SelectTrigger>
      <SelectContent className={styles.modelSelectContent} position="popper" align="start" sideOffset={6}>
        {task.models.map((m) => <SelectItem key={m.id} value={m.id} disabled={!m.available}>{m.name}</SelectItem>)}
      </SelectContent>
    </Select>
    <div className={styles.stage} role="group" aria-label={`待处理 ${queued.length} 张，已完成 ${done.length} 张，失败 ${failed.length} 张`}>
      <div className={styles.placeholder}><Images size={22} /></div><div className={`${styles.placeholder} ${styles.right}`}><Images size={22} /></div>
      {visible.map((photo) => {
        const complete = photo.status === 'done';
        const index = complete ? completedVisible.indexOf(photo) : 2 - left.indexOf(photo);
        return <motion.div key={photo.id} className={`${styles.photo} ${complete ? styles.completed : ''}`} initial={false} layout="position"
          animate={{ y: -index * 3, rotate: (index - 1) * 6 }}
          transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 38, mass: 0.8 }}
          style={{ left: complete ? 'calc(100% - 80px)' : '8px', zIndex: complete ? index + 4 : index + 1 }}
          role={complete ? 'button' : undefined}
          tabIndex={complete ? 0 : undefined}
          aria-label={complete ? `打开${photo.name}识别结果` : undefined}
          onClick={complete ? () => onOpenResults(photo.id) : undefined}
          onKeyDown={complete ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpenResults(photo.id);
            }
          } : undefined}
          title={`${photo.name}${photo.message ? `：${photo.message}` : ''}`}>
          {photo.url ? <img src={photo.url} alt={photo.name} /> : <Images aria-hidden />}
          {photo.status === 'running' && <div className={styles.scan} aria-hidden />}
        </motion.div>;
      })}
    </div>
    <div className={styles.labels}><span><Clock3 size={12} aria-hidden />待处理 {queued.length}</span><span><CircleCheck size={12} aria-hidden />已完成 {done.length}</span>{failed.length > 0 && <span><CircleAlert size={12} aria-hidden />失败 {failed.length}</span>}</div>
    <progress max={Math.max(1, photos.length)} value={done.length + failed.length} aria-label="图片推理进度" aria-valuetext={`已完成 ${done.length} 张，失败 ${failed.length} 张，共 ${photos.length} 张`} />
    <p className={styles.message} title={running?.name}>{task.error || (running ? running.name : reading ? '正在添加图片' : failed[0]?.message || done[done.length - 1]?.message || '等待图片')}</p>
    <footer>
      <button title="添加图片" aria-label="添加推理图片" disabled={isBrowserPreviewRuntime() || !task.modelId} onClick={() => void task.add()}><Plus size={15} />添加图片</button>
      <button title="添加图片文件夹（包含子文件夹）" aria-label="添加图片文件夹" disabled={isBrowserPreviewRuntime() || !task.modelId} onClick={() => void task.add(true)}><FolderPlus size={15} /></button>
      <button title={paused ? '继续处理' : '当前批次完成后暂停'} aria-label={paused ? '继续处理' : '暂停处理'} disabled={!canPause} onClick={() => task.setPaused(!paused)}>{paused ? <Play size={15} /> : <Pause size={15} />}</button>
      {failed.some((p) => !p.external) || (runtimeMode === 'browser-debug' && failed.length > 0) ? <button title="重试失败图片" aria-label="重试失败图片" onClick={task.retry}><RotateCcw size={15} /></button> : null}
    </footer>
  </section>;
}
