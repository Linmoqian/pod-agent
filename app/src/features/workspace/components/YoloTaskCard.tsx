/* 图片推理队列与完成归档动效。
 * Created on 2026-09-15
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { isYoloDropTarget } from '../hooks/yoloDropTarget';
import { confirm, open, save } from '@tauri-apps/plugin-dialog';
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
  resultUrl?: string;
  external?: boolean;
  modelId?: string;
  status: 'loading' | 'waiting' | 'running' | 'done' | 'error';
  message?: string;
  count?: number;
  counts?: Record<string, number>;
  detections?: YoloDetection[];
};
type Model = { id: string; name: string; available: boolean };
type YoloEvent = {
  id: string;
  status: 'running' | 'done' | 'error';
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
};

type ThumbnailJob = {
  id: string;
  path: string;
  external: boolean;
};

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
      if (!disposed && typeof payload.id === 'string' && ['running', 'done', 'error'].includes(payload.status)) callback.current(payload);
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; }).catch(() => {});
    return () => { disposed = true; unlisten?.(); };
  }, []);
}

export function useYoloTask() {
  const [photos, setPhotos] = useState<YoloPhoto[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [modelId, setModelId] = useState('');
  const [paused, setPaused] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState(false);
  const addingRef = useRef(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const active = useRef(false);
  const mounted = useRef(true);
  const urls = useRef<string[]>([]);
  const externalIds = useRef(new Set<string>());
  const thumbnailQueue = useRef<ThumbnailJob[]>([]);
  const activeThumbnailReads = useRef(0);
  const retainedPreviewCount = useRef(0);
  const runtimeMemoryGb = useRef<number | undefined>(undefined);

  const readThumbnail = async (job: ThumbnailJob) => {
    try {
      const bytes = await invoke<number[]>('yolo_thumbnail', { imagePath: job.path });
      if (!mounted.current) return;
      let url: string | undefined;
      // 大批量只保留少量缩略图；原图由 Rust 推理逐张读取，避免 WebView 持有整批 Blob。
      if (retainedPreviewCount.current < getImageReadPlan(runtimeMemoryGb.current).previewLimit) {
        url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
        urls.current.push(url);
        retainedPreviewCount.current += 1;
      }
      setPhotos((list) => list.map((photo) => {
        if (photo.id !== job.id) return photo;
        const preview = url ? { url } : {};
        if (job.external || photo.status !== 'loading') return { ...photo, ...preview };
        return { ...photo, ...preview, status: 'waiting' };
      }));
    } catch {
      if (!mounted.current || job.external) return;
      setPhotos((list) => list.filter((photo) => photo.id !== job.id));
      setError('部分图片不可读，已跳过；其余图片继续处理');
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

  const enqueueThumbnailReads = (jobs: ThumbnailJob[]) => {
    if (!jobs.length) return;
    thumbnailQueue.current.push(...jobs);
    pumpThumbnailReads();
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

  useYoloToolEvents((event) => {
    if (event.status === 'running' && event.imagePath) {
      if (externalIds.current.has(event.id)) return;
      externalIds.current.add(event.id);
      const path = event.imagePath;
      setPhotos((list) => list.some((p) => p.id === event.id) ? list : [...list, {
        id: event.id, path, name: path.split(/[/\\]/).pop() ?? path,
        status: 'running', external: true, modelId: event.modelId,
      }]);
      enqueueThumbnailReads([{ id: event.id, path, external: true }]);
    } else {
      setPhotos((list) => list.map((p) => p.id === event.id ? {
        ...p,
        status: event.status,
        message: event.message,
        count: event.count,
        counts: event.counts,
        detections: event.detections,
      } : p));
    }
  });
  useEffect(() => {
    const objectUrls = urls.current;
    mounted.current = true;
    if (isTauriRuntime()) void invoke<Model[]>('yolo_models').then((list) => {
      if (!mounted.current) return;
      setModels(list); setModelId(list.find((model) => model.available)?.id ?? '');
    }).catch(() => setError('模型清单加载失败'));
    return () => {
      mounted.current = false;
      thumbnailQueue.current = [];
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
      enqueueThumbnailReads(chunk.map((photo) => ({ id: photo.id, path: photo.path, external: false })));
      if (offset < batch.length) void yieldToUi().then(appendNext);
    };
    appendNext();
  };

  useEffect(() => {
    if (paused || active.current || !modelId) return;
    const next = photos.find((photo) => !photo.external && photo.status === 'waiting');
    if (!next) return;
    active.current = true;
    setPhotos((list) => list.map((p) => p.id === next.id ? { ...p, status: 'running' } : p));
    void invoke<YoloResponse>('yolo_detect_image', { modelId: next.modelId ?? modelId, imagePath: next.path }).then((result) => {
      if (!result.ok) throw new Error(result.message);
      if (mounted.current) setPhotos((list) => list.map((p) => p.id === next.id ? {
        ...p,
        status: 'done',
        message: result.message,
        count: result.count,
        counts: result.counts,
        detections: result.detections,
      } : p));
    }).catch((reason) => {
      if (mounted.current) setPhotos((list) => list.map((p) => p.id === next.id ? { ...p, status: 'error', message: String(reason) } : p));
    }).finally(() => { active.current = false; if (mounted.current) setRevision((value) => value + 1); });
  }, [photos, paused, modelId, revision]);
  const add = async (folder = false, dropped?: string[]) => {
    if (addingRef.current) { setError('正在读取图片，请稍后再添加'); return; }
    if (!modelId) { setError('请先选择可用的推理模型'); return; }
    addingRef.current = true;
    setAdding(true); setError('');
    try {
      const selected = dropped ?? await open(folder ? { directory: true, multiple: false } : { multiple: true, filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png'] }] });
      if (!selected) return;
      const paths = dropped ? await invoke<string[]>('yolo_drop_images', { paths: dropped }) : folder ? await invoke<string[]>('yolo_folder_images', { folderPath: selected }) : Array.isArray(selected) ? selected : [selected];
      if (!paths.length) { setError('文件夹中没有 JPG、JPEG 或 PNG 图片'); return; }
      const sourceIsFolder = folder || Boolean(dropped?.some((path) => !isImagePath(path)));
      if (sourceIsFolder || paths.length >= 100) {
        const accepted = await confirm(`发现 ${paths.length} 张图片，是否加入图片识别队列？`, {
          title: '添加图片',
          kind: 'info',
          okLabel: '加入',
          cancelLabel: '取消',
        });
        if (!accepted) return;
      }
      await loadRuntimeMemory();
      const batch = paths.map<YoloPhoto>((path) => ({
        id: crypto.randomUUID(),
        path,
        name: path.split(/[/\\]/).pop() ?? path,
        status: 'loading',
        modelId,
      }));
      appendBatch(batch);
    } catch { setError('图片添加失败，请检查文件是否可读'); }
    finally { addingRef.current = false; setAdding(false); }
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
  const loadImagePreview = async (photo: YoloPhoto) => {
    if (photo.previewUrl) return photo.previewUrl;
    if (!isTauriRuntime()) throw new Error('浏览器预览不读取本机图片，请在 Tauri 桌面端查看原图');
    const bytes = await invoke<number[]>('yolo_image_preview', { imagePath: photo.path });
    const previewUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    urls.current.push(previewUrl);
    setPhotos((list) => list.map((item) => item.id === photo.id ? { ...item, previewUrl } : item));
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
  return { photos, models, modelId, setModelId, paused, setPaused, adding, dragging, error, add,
    loadResultPreview, loadImagePreview, exportCsv,
    retry: () => setPhotos((list) => list.map((p) => !p.external && p.status === 'error' ? {
      ...p,
      status: 'waiting',
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
  const done = photos.filter((p) => p.status === 'done');
  const loading = photos.filter((p) => p.status === 'loading');
  const waiting = photos.filter((p) => p.status === 'waiting');
  const running = photos.find((p) => p.status === 'running');
  const failed = photos.filter((p) => p.status === 'error');
  const queued = [...loading, ...waiting, ...(running ? [running] : [])];
  const left = [...queued].sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running')).slice(0, 3);
  const visible = [...left, ...done.slice(-3)];
  const status = running
    ? '进行中'
    : loading.length
      ? '读取中'
      : paused && queued.length
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
    : loading.length
      ? ScanLine
      : failed.length
        ? CircleAlert
        : photos.length
          ? CircleCheck
          : Clock3;
  return <section className={styles.card} data-yolo-drop-target data-dragging={task.dragging} aria-label="图片推理任务">
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
        const index = complete ? done.slice(-3).indexOf(photo) : 2 - left.indexOf(photo);
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
    <p className={styles.message} title={running?.name}>{task.error || (running ? running.name : loading.length ? `正在读取 ${loading.length} 张图片` : failed[0]?.message || done[done.length - 1]?.message || 'YOLO · ONNX')}</p>
    <footer>
      <button title="添加图片" aria-label="添加推理图片" disabled={!isTauriRuntime() || !task.modelId || task.adding} onClick={() => void task.add()}><Plus size={15} />{task.adding ? '扫描中' : loading.length ? '读取中' : '添加图片'}</button>
      <button title="添加图片文件夹（包含子文件夹）" aria-label="添加图片文件夹" disabled={!isTauriRuntime() || !task.modelId || task.adding} onClick={() => void task.add(true)}><FolderPlus size={15} /></button>
      <button title={paused ? '继续处理' : '当前图片完成后暂停'} aria-label={paused ? '继续处理' : '暂停处理'} disabled={!queued.length} onClick={() => task.setPaused(!paused)}>{paused ? <Play size={15} /> : <Pause size={15} />}</button>
      {failed.some((p) => !p.external) && <button title="重试失败图片" aria-label="重试失败图片" onClick={task.retry}><RotateCcw size={15} /></button>}
    </footer>
  </section>;
}
