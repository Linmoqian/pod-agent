/* 图片推理队列与完成归档动效。
 * Created on 2026-09-15
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { isYoloDropTarget } from '../hooks/yoloDropTarget';
import { open, save } from '@tauri-apps/plugin-dialog';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, CircleAlert, CircleCheck, Clock3, FolderPlus, Images, Pause, Play, Plus, RotateCcw, ScanLine } from 'lucide-react';
import { isTauriRuntime } from '../../../services/workspace';
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

export type YoloDetection = {
  className: string;
  score: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

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
type Model = { id: string; name: string; available: boolean };
type YoloEvent = {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  imagePath?: string;
  modelId?: string;
  message?: string;
  count?: number;
  counts?: Record<string, number>;
  detections?: YoloDetection[];
};
type YoloResponse = {
  ok: boolean;
  message: string;
  count?: number;
  counts?: Record<string, number>;
  detections?: YoloDetection[];
};

type ResultReveal = {
  photoId: string;
  path: string;
  result: YoloResponse;
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
    if (!isTauriRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<YoloEvent>('lian-yolo-event', ({ payload }) => {
      if (!disposed && typeof payload.id === 'string' && ['queued', 'running', 'done', 'error'].includes(payload.status)) callback.current(payload);
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; }).catch(() => {});
    return () => { disposed = true; unlisten?.(); };
  }, []);
}

export function useYoloTask() {
  const [photos, setPhotos] = useState<YoloPhoto[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [modelId, setModelId] = useState('');
  const [paused, setPausedState] = useState(false);
  const [addingCount, setAddingCount] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [readProgress, setReadProgress] = useState({ completed: 0, total: 0 });
  const [addConfirmation, setAddConfirmation] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const active = useRef(false);
  const mounted = useRef(true);
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
  const addConfirmationQueue = useRef<AddConfirmationRequest[]>([]);
  const resultRevealQueue = useRef<ResultReveal[]>([]);
  const revealingResults = useRef(false);
  const pausedRef = useRef(false);
  photosRef.current = photos;

  // 暂停只拦截下一批的启动;当前 Batch 不可被 Tauri invoke 中途抢占,完成后再停在队列边界。
  const setPaused = (next: boolean) => {
    pausedRef.current = next;
    setPausedState(next);
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

  const registerReadJobs = (count: number) => {
    if (count <= 0) return;
    setReadProgress((current) => ({
      completed: current.completed,
      total: current.total + count,
    }));
  };

  const completeReadJob = () => {
    setReadProgress((current) => {
      if (!current.total) return current;
      const completed = Math.min(current.total, current.completed + 1);
      return completed >= current.total
        ? { completed: 0, total: 0 }
        : { completed, total: current.total };
    });
  };

  const readThumbnail = async (job: ThumbnailJob) => {
    try {
      const bytes = await invoke<number[]>('yolo_thumbnail', { imagePath: job.path });
      if (!mounted.current) return;
      const previewLimit = getImageReadPlan(runtimeMemoryGb.current).previewLimit;
      const protectedIds = new Set([
        thumbnailFocusId.current,
        ...photosRef.current.filter((photo) => photo.status === 'done').slice(-3).map((photo) => photo.id),
        ...photosRef.current.filter((photo) => photo.status === 'running').slice(0, 3).map((photo) => photo.id),
      ]);
      const shouldEvict = thumbnailUrls.current.size >= previewLimit;
      const oldest = shouldEvict
        ? [...thumbnailUrls.current.keys()].find((id) => !protectedIds.has(id))
        : undefined;
      const evictedUrl = typeof oldest === 'string' ? thumbnailUrls.current.get(oldest) : undefined;
      if (typeof oldest === 'string') thumbnailUrls.current.delete(oldest);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
      thumbnailUrls.current.set(job.id, url);
      retainedPreviewCount.current = thumbnailUrls.current.size;
      urls.current.push(url);
      setPhotos((list) => list.map((photo) => {
        if (photo.id === oldest) return { ...photo, url: undefined };
        if (photo.id !== job.id) return photo;
        return { ...photo, url };
      }));
      if (evictedUrl) URL.revokeObjectURL(evictedUrl);
    } catch {
      // 缩略图只是展示层资源；即使它失败，也不能阻塞或移除真实推理任务。
      thumbnailScheduledIds.current.delete(job.id);
    } finally {
      thumbnailResolvers.current.get(job.id)?.();
      thumbnailResolvers.current.delete(job.id);
      thumbnailPromises.current.delete(job.id);
      if (mounted.current) {
        reservedPreviewCount.current = Math.max(0, reservedPreviewCount.current - 1);
        completeReadJob();
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
      const cached = thumbnailUrls.current.has(job.id);
      const inFlight = thumbnailPromises.current.has(job.id);
      return !inFlight && (!thumbnailScheduledIds.current.has(job.id) || (prioritize && !cached));
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
    registerReadJobs(selected.length);
    if (prioritize) thumbnailQueue.current.unshift(...selected);
    else thumbnailQueue.current.push(...selected);
    pumpThumbnailReads();
  };

  const ensureThumbnail = async (job: ThumbnailJob) => {
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
    if (!isTauriRuntime()) return undefined;
    await ensureThumbnail({ id: photo.id, path: photo.path, external: Boolean(photo.external) });
    const url = thumbnailUrls.current.get(photo.id);
    if (!url) throw new Error('缩略图加载失败');
    return url;
  };

  const loadRuntimeMemory = async () => {
    if (runtimeMemoryGb.current !== undefined || !isTauriRuntime()) return;
    try {
      const memoryGb = await invoke<number>('yolo_memory_gb');
      if (Number.isFinite(memoryGb) && memoryGb > 0) runtimeMemoryGb.current = memoryGb;
    } catch {
      // 系统内存不可读时使用 WebView 报告值或保守默认值。
    }
  };

  const revealNextResults = async () => {
    if (revealingResults.current) return;
    revealingResults.current = true;
    try {
      while (mounted.current && resultRevealQueue.current.length) {
        const next = resultRevealQueue.current.shift();
        if (!next) continue;
        thumbnailFocusId.current = next.photoId;
        try {
          await ensureThumbnail({ id: next.photoId, path: next.path, external: false });
        } finally {
          thumbnailFocusId.current = null;
        }
        if (!mounted.current) return;
        const finishedAt = Date.now();
        setPhotos((list) => list.map((photo) => {
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
        if (resultRevealQueue.current.length) {
          await waitForResultReveal(resultRevealDelay(resultRevealQueue.current.length));
        }
      }
    } finally {
      revealingResults.current = false;
    }
  };

  const enqueueResultReveals = (results: ResultReveal[]) => {
    if (!results.length) return;
    resultRevealQueue.current.push(...results);
    void revealNextResults();
  };

  useYoloToolEvents((event) => {
    const path = event.imagePath;
    if (path) {
      const isNew = !externalIds.current.has(event.id);
      const terminal = event.status === 'done' || event.status === 'error';
      const status = event.status === 'queued' ? 'waiting' : event.status;
      if (isNew) {
        externalIds.current.add(event.id);
        const now = Date.now();
        setPhotos((list) => list.some((p) => p.id === event.id) ? list : [...list, {
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
        setPhotos((list) => list.map((p) => p.id === event.id ? {
          ...p,
          status,
          startedAt: event.status === 'running' ? p.startedAt ?? Date.now() : p.startedAt,
          finishedAt: terminal ? p.finishedAt ?? Date.now() : p.finishedAt,
          message: event.message ?? p.message,
          count: event.count ?? p.count,
          counts: event.counts ?? p.counts,
          detections: event.detections ?? p.detections,
        } : p));
      }
      if (event.status === 'running' || event.status === 'done') {
        enqueueThumbnailReads([{ id: event.id, path, external: true }], true);
      } else if (isNew) {
        enqueueThumbnailReads([{ id: event.id, path, external: true }]);
      }
      return;
    }
    if (event.status === 'queued') return;
    const status = event.status === 'done' || event.status === 'error' ? event.status : 'running';
    setPhotos((list) => list.map((p) => p.id === event.id ? {
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
    if (isTauriRuntime()) void invoke<Model[]>('yolo_models').then((list) => {
      if (!mounted.current) return;
      setModels(list); setModelId(list.find((model) => model.available)?.id ?? '');
    }).catch(() => setError('模型清单加载失败'));
    return () => {
      mounted.current = false;
      thumbnailQueue.current = [];
      thumbnailUrlCache.clear();
      scheduledThumbnailIds.clear();
      thumbnailPromiseCache.clear();
      thumbnailResolverCache.clear();
      addConfirmationQueueCache.splice(0).forEach(({ resolve }) => resolve(false));
      resultRevealQueue.current = [];
      reservedPreviewCount.current = 0;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const appendBatch = (batch: YoloPhoto[]) => {
    const { appendChunkSize } = getImageReadPlan(runtimeMemoryGb.current);
    let offset = 0;
    const appendNext = () => {
      if (!mounted.current || offset >= batch.length) return;
      const chunk = batch.slice(offset, offset + appendChunkSize);
      offset += chunk.length;
      setPhotos((list) => [...list, ...chunk]);
      // 预览只读取当前队列最前面的有限数量，其余图片直接进入推理队列。
      enqueueThumbnailReads(chunk.map((photo) => ({ id: photo.id, path: photo.path, external: false })));
      if (offset < batch.length) void yieldToUi().then(appendNext);
    };
    appendNext();
  };

  useEffect(() => {
    if (paused || pausedRef.current || active.current || !modelId) return;
    const batch = photos
      .filter((photo) => !photo.external && photo.status === 'waiting')
      .slice(0, getImageReadPlan(runtimeMemoryGb.current).inferenceBatchSize);
    if (!batch.length) return;
    // 当前 Batch 优先补齐系统缩略图，确保处理中卡片持续显示真实图片而不是占位图。
    enqueueThumbnailReads(
      batch.map((photo) => ({ id: photo.id, path: photo.path, external: false })),
      true,
    );
    const ids = new Set(batch.map((photo) => photo.id));
    const requestModelId = batch[0].modelId ?? modelId;
    active.current = true;
    setPhotos((list) => list.map((p) => ids.has(p.id) ? {
      ...p,
      status: 'running',
      startedAt: Date.now(),
      finishedAt: undefined,
    } : p));
    void invoke<YoloResponse[]>('yolo_detect_images', {
      modelId: requestModelId,
      imagePaths: batch.map((photo) => photo.path),
    }).then((results) => {
      if (!Array.isArray(results)) throw new Error('批量推理响应无效');
      if (!mounted.current) return;
      enqueueResultReveals(batch.map((photo, index) => ({
        photoId: photo.id,
        path: photo.path,
        result: results[index] ?? { ok: false, message: '批量推理未返回该图片结果' },
      })));
    }).catch((reason) => {
      if (!mounted.current) return;
      const message = reason instanceof Error ? reason.message : String(reason);
      enqueueResultReveals(batch.map((photo) => ({
        photoId: photo.id,
        path: photo.path,
        result: { ok: false, message },
      })));
    }).finally(() => { active.current = false; if (mounted.current) setRevision((value) => value + 1); });
  }, [photos, paused, modelId, revision]);
  const add = async (folder = false, dropped?: string[]) => {
    if (!modelId) { setError('请先选择可用的推理模型'); return; }
    setAddingCount((count) => count + 1);
    setError('');
    try {
      const selected = dropped ?? await open(folder ? { directory: true, multiple: false } : { multiple: true, filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png'] }] });
      if (!selected) return;
      const paths = dropped ? await invoke<string[]>('yolo_drop_images', { paths: dropped }) : folder ? await invoke<string[]>('yolo_folder_images', { folderPath: selected }) : Array.isArray(selected) ? selected : [selected];
      if (!paths.length) { setError('文件夹中没有 JPG、JPEG 或 PNG 图片'); return; }
      const sourceIsFolder = folder || Boolean(dropped?.some((path) => !isImagePath(path)));
      if (sourceIsFolder || paths.length >= 100) {
        const accepted = await requestAddConfirmation(paths.length);
        if (!accepted) return;
      }
      await loadRuntimeMemory();
      const batch = paths.map<YoloPhoto>((path) => ({
        id: crypto.randomUUID(),
        path,
        name: path.split(/[/\\]/).pop() ?? path,
        status: 'waiting',
        modelId,
      }));
      appendBatch(batch);
    } catch { setError('图片添加失败，请检查文件是否可读'); }
    finally { setAddingCount((count) => Math.max(0, count - 1)); }
  };
  const dropCallback = useRef(add);
  dropCallback.current = add;
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (disposed) return;
      if (payload.type === 'leave') { setDragging(false); return; }
      const inside = isYoloDropTarget(payload.position);
      setDragging(payload.type !== 'drop' && inside);
      if (payload.type === 'drop' && inside) void dropCallback.current(false, payload.paths);
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; }).catch(() => setError('拖放监听失败，请使用添加按钮'));
    return () => { disposed = true; unlisten?.(); };
  }, []);
  const loadResultPreview = async (photo: YoloPhoto) => {
    if (photo.resultUrl) return photo.resultUrl;
    if (!isTauriRuntime()) throw new Error('浏览器预览不读取本机图片，请在 Tauri 桌面端查看结果图');
    const bytes = await invoke<number[]>('yolo_result_preview', {
      imagePath: photo.path,
      detections: photo.detections ?? [],
    });
    const resultUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    urls.current.push(resultUrl);
    setPhotos((list) => list.map((item) => item.id === photo.id ? { ...item, resultUrl } : item));
    return resultUrl;
  };
  const loadImagePreview = async (photo: YoloPhoto, options: ImagePreviewOptions = {}) => {
    const forceFallback = options.forceFallback === true;
    if (!forceFallback && photo.previewUrl) return photo.previewUrl;
    if (!isTauriRuntime()) throw new Error('浏览器预览不读取本机图片，请在 Tauri 桌面端查看原图');
    if (!forceFallback) {
      try {
        await invoke('yolo_prepare_image_preview', { imagePath: photo.path });
        const nativeUrl = convertFileSrc(photo.path, 'asset');
        setPhotos((list) => list.map((item) => item.id === photo.id
          ? { ...item, previewUrl: nativeUrl, previewSource: 'native' }
          : item));
        return nativeUrl;
      } catch {
        // 资产协议不可用时继续走现有解码链路，避免原图预览中断。
      }
    }
    setPhotos((list) => list.map((item) => item.id === photo.id
      ? { ...item, previewUrl: undefined, previewSource: undefined }
      : item));
    const bytes = await invoke<number[]>('yolo_image_preview', { imagePath: photo.path });
    const previewUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    urls.current.push(previewUrl);
    setPhotos((list) => list.map((item) => item.id === photo.id
      ? { ...item, previewUrl, previewSource: 'decoded' }
      : item));
    return previewUrl;
  };
  const exportCsv = async (rows: YoloPhoto[]) => {
    if (!isTauriRuntime()) throw new Error('浏览器预览不写入本机文件，请在 Tauri 桌面端导出 CSV');
    const outputPath = await save({
      defaultPath: '图片识别结果.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (!outputPath) return;
    await invoke('yolo_export_csv', {
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
  return { photos, models, modelId, setModelId, paused, setPaused, adding: addingCount > 0, dragging, error, add,
    addConfirmation, resolveAddConfirmation,
    readProgress,
    loadThumbnail, loadResultPreview, loadImagePreview, exportCsv,
    retry: () => setPhotos((list) => list.map((p) => !p.external && p.status === 'error' ? {
      ...p,
      status: 'waiting',
      startedAt: undefined,
      finishedAt: undefined,
      message: undefined,
      count: undefined,
      counts: undefined,
      detections: undefined,
    } : p)) };
}

export type YoloTask = ReturnType<typeof useYoloTask>;

export default function YoloTaskCard({
  task,
  onOpenResults,
}: {
  task: YoloTask;
  onOpenResults: (photoId?: string) => void;
}) {
  const reduced = useReducedMotion();
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
  const canPause = localQueued.length > 0;
  const reading = task.adding || task.readProgress.total > task.readProgress.completed;
  const left = queued.slice(0, 3);
  const completedVisible = done.slice(-3);
  const visible = [...left, ...completedVisible];
  const status = running
    ? paused && !running.external ? '本批次完成后暂停' : '进行中'
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
  return <section className={styles.card} data-yolo-drop-target data-dragging={task.dragging} aria-label="图片推理任务">
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
    <header><strong><ScanLine size={15} aria-hidden />图片识别</strong><button type="button" className={styles.resultStatus} title="打开图片识别结果" aria-label={`打开图片识别结果，当前状态：${status}`} onClick={() => onOpenResults()}><StatusIcon size={13} aria-hidden />{status}<ArrowUpRight size={12} aria-hidden /></button></header>
    <Select
      value={task.modelId || undefined}
      onValueChange={task.setModelId}
      disabled={queued.length > 0 || task.models.length === 0}
    >
      <SelectTrigger className={styles.modelSelect} size="sm" aria-label="推理模型">
        <SelectValue placeholder={task.models.length ? '选择推理模型' : isTauriRuntime() ? '暂无模型' : '桌面端可用'} />
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
    {reading && <div className={styles.readProgressGroup} aria-live="polite">
      <div className={styles.readProgressMeta}>
        <span><Images size={12} aria-hidden />预览读取</span>
        <span>{task.readProgress.total ? `${task.readProgress.completed} / ${task.readProgress.total}` : '扫描中…'}</span>
      </div>
      <progress
        className={styles.readProgress}
        max={Math.max(1, task.readProgress.total)}
        value={task.readProgress.total ? task.readProgress.completed : undefined}
        aria-label="预览读取进度"
        aria-valuetext={task.readProgress.total
          ? `已生成 ${task.readProgress.completed} 张预览，共 ${task.readProgress.total} 张`
          : '正在生成预览'}
      />
    </div>}
    <progress max={Math.max(1, photos.length)} value={done.length + failed.length} aria-label="图片推理进度" aria-valuetext={`已完成 ${done.length} 张，失败 ${failed.length} 张，共 ${photos.length} 张`} />
    <p className={styles.message} title={running?.name}>{task.error || (running ? running.name : reading ? (task.readProgress.total ? `正在生成预览 ${task.readProgress.completed} / ${task.readProgress.total}` : '正在生成预览') : failed[0]?.message || done[done.length - 1]?.message || '等待图片')}</p>
    <footer>
      <button title="添加图片" aria-label="添加推理图片" disabled={!isTauriRuntime() || !task.modelId} onClick={() => void task.add()}><Plus size={15} />添加图片</button>
      <button title="添加图片文件夹（包含子文件夹）" aria-label="添加图片文件夹" disabled={!isTauriRuntime() || !task.modelId} onClick={() => void task.add(true)}><FolderPlus size={15} /></button>
      <button title={paused ? '继续处理' : '当前批次完成后暂停'} aria-label={paused ? '继续处理' : '暂停处理'} disabled={!canPause} onClick={() => task.setPaused(!paused)}>{paused ? <Play size={15} /> : <Pause size={15} />}</button>
      {failed.some((p) => !p.external) && <button title="重试失败图片" aria-label="重试失败图片" onClick={task.retry}><RotateCcw size={15} /></button>}
    </footer>
  </section>;
}
