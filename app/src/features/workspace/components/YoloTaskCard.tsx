/* 图片推理队列与完成归档动效。
 * Created on 2026-09-14
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { motion, useReducedMotion } from 'motion/react';
import { Images, Plus, Pause, Play, RotateCcw } from 'lucide-react';
import { isTauriRuntime } from '../../../services/workspace';
import styles from './YoloTaskCard.module.css';

type Photo = { id: string; path: string; name: string; url?: string; status: 'waiting' | 'running' | 'done' | 'error'; message?: string };
type Model = { id: string; name: string; available: boolean };

export function useYoloTask() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [modelId, setModelId] = useState('');
  const [paused, setPaused] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const active = useRef(false);
  const mounted = useRef(true);
  const urls = useRef<string[]>([]);
  useEffect(() => {
    mounted.current = true;
    if (isTauriRuntime()) void invoke<Model[]>('yolo_models').then((list) => {
      if (!mounted.current) return;
      setModels(list); setModelId(list.find((model) => model.available)?.id ?? '');
    }).catch(() => setError('模型清单加载失败'));
    return () => { mounted.current = false; urls.current.forEach((url) => URL.revokeObjectURL(url)); };
  }, []);
  useEffect(() => {
    if (paused || active.current || !modelId) return;
    const next = photos.find((photo) => photo.status === 'waiting');
    if (!next) return;
    active.current = true;
    setPhotos((list) => list.map((p) => p.id === next.id ? { ...p, status: 'running' } : p));
    void invoke<{ ok: boolean; message: string }>('yolo_detect_image', { modelId, imagePath: next.path }).then((result) => {
      if (!result.ok) throw new Error(result.message);
      if (mounted.current) setPhotos((list) => list.map((p) => p.id === next.id ? { ...p, status: 'done', message: result.message } : p));
    }).catch((reason) => {
      if (mounted.current) setPhotos((list) => list.map((p) => p.id === next.id ? { ...p, status: 'error', message: String(reason) } : p));
    }).finally(() => { active.current = false; if (mounted.current) setRevision((value) => value + 1); });
  }, [photos, paused, modelId, revision]);
  const add = async () => {
    if (adding) return;
    setAdding(true); setError('');
    try {
      const selected = await open({ multiple: true, filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png'] }] });
      if (!selected) return;
      const batch: Photo[] = [];
      for (const path of Array.isArray(selected) ? selected : [selected]) {
        const bytes = await invoke<number[]>('yolo_thumbnail', { imagePath: path });
        if (!mounted.current) return;
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
        urls.current.push(url);
        batch.push({ id: crypto.randomUUID(), path, name: path.split(/[/\\]/).pop() ?? path, url, status: 'waiting' });
      }
      if (mounted.current) setPhotos((list) => [...list, ...batch]);
    } catch { setError('图片添加失败，请检查文件是否可读'); }
    finally { setAdding(false); }
  };
  return { photos, models, modelId, setModelId, paused, setPaused, adding, error, add,
    retry: () => setPhotos((list) => list.map((p) => p.status === 'error' ? { ...p, status: 'waiting', message: undefined } : p)) };
}

export default function YoloTaskCard({ task }: { task: ReturnType<typeof useYoloTask> }) {
  const reduced = useReducedMotion();
  const { photos, paused } = task;
  const done = photos.filter((p) => p.status === 'done');
  const pending = photos.filter((p) => p.status !== 'done');
  const running = photos.find((p) => p.status === 'running');
  const failed = photos.filter((p) => p.status === 'error');
  const left = [...pending].sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running')).slice(0, 3);
  const visible = [...left, ...done.slice(-3)];
  const status = running ? '进行中' : paused ? '已暂停' : failed.length ? '部分失败' : photos.length && !pending.length ? '已完成' : '等待图片';
  return <section className={styles.card} aria-label="图片推理任务">
    <header><strong>图片识别</strong><span role="status">{status}</span></header>
    <select aria-label="推理模型" value={task.modelId} disabled={Boolean(running) || pending.some((p) => p.status === 'waiting')} onChange={(e) => task.setModelId(e.target.value)}>
      {!task.models.length && <option value="">{isTauriRuntime() ? '暂无模型' : '桌面端可用'}</option>}
      {task.models.map((m) => <option key={m.id} value={m.id} disabled={!m.available}>{m.name}</option>)}
    </select>
    <div className={styles.stage} aria-label={`等待处理 ${pending.length} 张，已完成 ${done.length} 张`}>
      <div className={styles.placeholder}><Images size={22} /></div><div className={`${styles.placeholder} ${styles.right}`}><Images size={22} /></div>
      {visible.map((photo) => {
        const complete = photo.status === 'done';
        const index = complete ? done.slice(-3).indexOf(photo) : 2 - left.indexOf(photo);
        return <motion.div key={photo.id} className={styles.photo} initial={false} layout="position"
          animate={{ y: -index * 3, rotate: (index - 1) * 6 }}
          transition={{ duration: reduced ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          style={{ left: complete ? 'calc(100% - 80px)' : '8px', zIndex: complete ? index + 4 : index + 1 }} title={`${photo.name}${photo.message ? `：${photo.message}` : ''}`}>
          <img src={photo.url} alt={photo.name} />
          {photo.status === 'running' && <motion.div className={styles.scan} animate={reduced ? { opacity: 0.6 } : { transform: ['translateY(0px)', 'translateY(62px)', 'translateY(0px)'] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }} />}
        </motion.div>;
      })}
    </div>
    <div className={styles.labels}><span>待处理 {pending.length}</span><span>已完成 {done.length}</span></div>
    <progress max={Math.max(1, photos.length)} value={done.length} aria-label="图片推理进度" />
    <p className={styles.message} title={running?.name}>{task.error || (running ? running.name : failed[0]?.message || done[done.length - 1]?.message || 'YOLO · ONNX')}</p>
    <footer>
      <button title="添加图片" aria-label="添加推理图片" disabled={!isTauriRuntime() || !task.modelId || task.adding} onClick={() => void task.add()}><Plus size={15} />{task.adding ? '读取中' : '添加图片'}</button>
      <button title={paused ? '继续处理' : '当前图片完成后暂停'} aria-label={paused ? '继续处理' : '暂停处理'} disabled={!pending.length} onClick={() => task.setPaused(!paused)}>{paused ? <Play size={15} /> : <Pause size={15} />}</button>
      {failed.length > 0 && <button title="重试失败图片" aria-label="重试失败图片" onClick={task.retry}><RotateCcw size={15} /></button>}
    </footer>
  </section>;
}
