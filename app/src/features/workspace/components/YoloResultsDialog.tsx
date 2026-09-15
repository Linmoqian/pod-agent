/* 图片识别结果工作区面板、批量对比与导出入口。
 * Created on 2026-09-15
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  CheckSquare,
  Download,
  ImageIcon,
  LoaderCircle,
  Search,
  Square,
} from 'lucide-react';
import type { YoloPhoto, YoloTask } from './YoloTaskCard';
import styles from './YoloResultsDialog.module.css';

type YoloResultsPanelProps = Pick<
  YoloTask,
  'photos' | 'loadImagePreview' | 'loadResultPreview' | 'exportCsv'
> & {
  initialPhotoId?: string;
};

function statusLabel(photo: YoloPhoto) {
  if (photo.status === 'done') return '完成';
  if (photo.status === 'error') return '失败';
  if (photo.status === 'running') return '推理中';
  if (photo.status === 'loading') return '读取中';
  return '等待中';
}

function countLabel(photo: YoloPhoto) {
  if (photo.status !== 'done') return '-';
  return typeof photo.count === 'number' ? `${photo.count} 个对象` : '无计数结果';
}

function resultLabel(photo: YoloPhoto) {
  if (photo.status === 'loading') return '读取图片';
  if (photo.status === 'waiting') return '等待推理';
  if (photo.status === 'running') return '正在推理';
  if (photo.status === 'error') return '推理失败';
  return photo.detections?.length ? '推理结果' : '推理结果（无框数据）';
}

function LoadingIcon() {
  const reduced = useReducedMotion();
  return <motion.span aria-label="处理中" animate={reduced ? undefined : { rotate: 360 }}
    transition={reduced ? undefined : { duration: 0.8, repeat: Infinity, ease: 'linear' }}>
    <LoaderCircle size={15} />
  </motion.span>;
}

export default function YoloResultsPanel({
  photos,
  initialPhotoId,
  loadImagePreview,
  loadResultPreview,
  exportCsv,
}: YoloResultsPanelProps) {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingImages, setLoadingImages] = useState<string[]>([]);
  const [loadingResults, setLoadingResults] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const filtered = useMemo(() => photos.filter((photo) => {
    const needle = query.trim().toLocaleLowerCase();
    return !needle || `${photo.name} ${photo.message ?? ''}`.toLocaleLowerCase().includes(needle);
  }), [photos, query]);
  const completed = photos.filter((photo) => photo.status === 'done');
  const filteredCompleted = filtered.filter((photo) => photo.status === 'done');
  const selected = photos.filter((photo) => selectedIds.includes(photo.id));
  const hasInitialPhoto = Boolean(initialPhotoId && photos.some((photo) => photo.id === initialPhotoId));

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => photos.some((photo) => photo.id === id)));
  }, [photos]);
  useEffect(() => {
    if (initialPhotoId && hasInitialPhoto) {
      setSelectedIds([initialPhotoId]);
    }
  }, [hasInitialPhoto, initialPhotoId]);

  const loadImage = async (photo: YoloPhoto) => {
    if (photo.previewUrl || loadingImages.includes(photo.id)) return;
    setLoadingImages((current) => [...current, photo.id]);
    setError('');
    try {
      await loadImagePreview(photo);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '原图加载失败');
    } finally {
      setLoadingImages((current) => current.filter((id) => id !== photo.id));
    }
  };
  const loadResult = async (photo: YoloPhoto) => {
    if (photo.resultUrl || loadingResults.includes(photo.id)) return;
    setLoadingResults((current) => [...current, photo.id]);
    setError('');
    try {
      await loadResultPreview(photo);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '结果图加载失败');
    } finally {
      setLoadingResults((current) => current.filter((id) => id !== photo.id));
    }
  };
  const toggle = (photo: YoloPhoto) => {
    setSelectedIds((current) =>
      current.includes(photo.id)
        ? current.filter((item) => item !== photo.id)
        : [...current, photo.id],
    );
    if (!selectedIds.includes(photo.id)) {
      void loadImage(photo);
      if (photo.status === 'done') void loadResult(photo);
    }
  };
  const toggleAll = () => {
    const ids = filteredCompleted.map((photo) => photo.id);
    const selectAll = !ids.every((id) => selectedIds.includes(id));
    setSelectedIds((current) => selectAll
      ? [...new Set([...current, ...ids])]
      : current.filter((id) => !ids.includes(id)));
    if (selectAll) filteredCompleted.forEach((photo) => {
      void loadImage(photo);
      void loadResult(photo);
    });
  };
  const exportResults = async () => {
    const rows = selected.length ? selected : filtered;
    if (!rows.length) return;
    setExporting(true);
    setError('');
    try {
      await exportCsv(rows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'CSV 导出失败');
    } finally {
      setExporting(false);
    }
  };

  return <section className={styles.panel} aria-labelledby="yolo-results-title">
    <header className={styles.header}>
      <div className={styles.headerCopy}>
        <span className={styles.eyebrow}>图片识别</span>
        <h2 id="yolo-results-title">图片识别结果</h2>
        <p>{photos.length} 张图片，完成 {photos.filter((photo) => photo.status === 'done').length} 张</p>
      </div>
      <div className={styles.summary} aria-label="识别结果概览">
        <span><b>{completed.length}</b> 已完成</span>
        <span><b>{photos.filter((photo) => photo.status === 'error').length}</b> 失败</span>
      </div>
    </header>
    <div className={styles.toolbar}>
      <label className={styles.search}><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选图片或结果" aria-label="筛选图片或结果" /></label>
      <button type="button" className={styles.selectButton} disabled={!filteredCompleted.length} onClick={toggleAll}>
        {filteredCompleted.length > 0 && filteredCompleted.every((photo) => selectedIds.includes(photo.id)) ? <CheckSquare size={15} /> : <Square size={15} />}
        全选完成项
      </button>
      <button type="button" className={styles.exportButton} disabled={!filtered.length || exporting} onClick={() => void exportResults()}>
        {exporting ? <LoadingIcon /> : <Download size={15} />}
        导出 {selected.length || filtered.length} 项
      </button>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.body}>
      <aside className={styles.list} aria-label="图片结果列表">
        <div className={styles.listHeading}><span>图片</span><span>{filtered.length} 项</span></div>
        {!filtered.length && <p className={styles.empty}>没有匹配的图片</p>}
        {filtered.map((photo) => <button type="button" key={photo.id} className={styles.row} data-selected={selectedIds.includes(photo.id)} aria-pressed={selectedIds.includes(photo.id)} onClick={() => toggle(photo)}>
          <span className={styles.checkbox}>{selectedIds.includes(photo.id) ? <CheckSquare size={16} /> : <Square size={16} />}</span>
          {photo.url ? <img src={photo.url} alt="" /> : <span className={styles.imageFallback}><ImageIcon size={16} /></span>}
          <span className={styles.rowCopy}><strong title={photo.name}>{photo.name}</strong><small>{countLabel(photo)}</small></span>
          <span className={styles.status} data-status={photo.status}>{statusLabel(photo)}</span>
        </button>)}
      </aside>
      <section className={styles.comparison} aria-label="批量图片对比">
        {selected.length === 0 && <div className={styles.emptyComparison}><ImageIcon size={24} /><p>勾选图片以查看原图与推理结果</p></div>}
        {selected.map((photo) => <article key={photo.id} className={styles.comparisonItem}>
          <header><strong title={photo.name}>{photo.name}</strong><span>{countLabel(photo)}</span></header>
          <div className={styles.imagePair}>
            <figure><button type="button" disabled={loadingImages.includes(photo.id)} onClick={() => void loadImage(photo)} title="生成原图预览">
              {photo.previewUrl ? <img src={photo.previewUrl} alt={`${photo.name} 原图`} /> : loadingImages.includes(photo.id) ? <LoadingIcon /> : <ImageIcon size={22} />}
            </button><figcaption>原图</figcaption></figure>
            <figure><button type="button" disabled={photo.status !== 'done' || loadingResults.includes(photo.id)} onClick={() => void loadResult(photo)} title={photo.status === 'done' ? '生成标注结果图' : resultLabel(photo)}>
              {photo.resultUrl ? <img src={photo.resultUrl} alt={`${photo.name} 推理结果`} /> : loadingResults.includes(photo.id) ? <LoadingIcon /> : photo.status === 'done' ? <ImageIcon size={22} /> : <span>{resultLabel(photo)}</span>}
            </button><figcaption>{resultLabel(photo)}</figcaption></figure>
          </div>
          <p>{photo.message || '尚未返回推理摘要'}</p>
          {photo.counts && Object.keys(photo.counts).length > 0 && <div className={styles.counts}>{Object.entries(photo.counts).map(([name, count]) => <span key={name}>{name} <b>{count}</b></span>)}</div>}
        </article>)}
      </section>
    </div>
  </section>;
}
