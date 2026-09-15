/* 图片识别结果工作区面板、批量对比与导出入口。
 * Created on 2026-09-15
 * @author: https://github.com/Linmoqian
 */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Download,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  ImageIcon,
  List,
  LoaderCircle,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { YoloPhoto, YoloTask } from './YoloTaskCard';
import styles from './YoloResultsDialog.module.css';

type YoloResultsPanelProps = Pick<
  YoloTask,
  'photos' | 'loadImagePreview' | 'loadResultPreview' | 'exportCsv'
> & {
  initialPhotoId?: string;
};

const THUMBNAIL_MIN = 108;
const THUMBNAIL_MAX = 240;
const THUMBNAIL_DEFAULT = 142;
const RESULTS_LIST_DEFAULT_PERCENT = 31;
const RESULTS_LIST_MAX_PERCENT = 72;
const RESULTS_COMPARISON_MIN_WIDTH = 320;
const RESULTS_DIVIDER_WIDTH = 16;

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

const ResultRow = memo(function ResultRow({
  photo,
  active,
  onActivate,
}: {
  photo: YoloPhoto;
  active: boolean;
  onActivate: (photo: YoloPhoto) => void;
}) {
  return <button
    type="button"
    className={styles.row}
    data-active={active}
    role="option"
    aria-selected={active}
    onClick={() => onActivate(photo)}
  >
    {photo.url
      ? <img className={styles.rowThumb} src={photo.url} alt="" />
      : <span className={`${styles.rowThumb} ${styles.imageFallback}`}><ImageIcon size={16} /></span>}
    <span className={styles.rowCopy}><strong title={photo.name}>{photo.name}</strong><small>{countLabel(photo)}</small></span>
    <span className={styles.status} data-status={photo.status}>{statusLabel(photo)}</span>
  </button>;
});

function maxResultsListPercent(bodyWidth: number) {
  if (!bodyWidth) return RESULTS_LIST_MAX_PERCENT;
  const available = bodyWidth - RESULTS_COMPARISON_MIN_WIDTH - RESULTS_DIVIDER_WIDTH;
  return Math.max(0, Math.min(RESULTS_LIST_MAX_PERCENT, (available / bodyWidth) * 100));
}

export default function YoloResultsPanel({
  photos,
  initialPhotoId,
  loadImagePreview,
  loadResultPreview,
  exportCsv,
}: YoloResultsPanelProps) {
  const [query, setQuery] = useState('');
  const [activePhotoId, setActivePhotoId] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [thumbnailSize, setThumbnailSize] = useState(THUMBNAIL_DEFAULT);
  const [listWidthPercent, setListWidthPercent] = useState(RESULTS_LIST_DEFAULT_PERCENT);
  const [loadingImages, setLoadingImages] = useState<string[]>([]);
  const [loadingResults, setLoadingResults] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    startWidthPercent: number;
    bodyWidth: number;
  } | null>(null);
  const expandedListWidthRef = useRef(RESULTS_LIST_DEFAULT_PERCENT);
  const listWidthPercentRef = useRef(RESULTS_LIST_DEFAULT_PERCENT);
  const [resizing, setResizing] = useState(false);
  const lastInitialPhotoId = useRef<string | undefined>(undefined);
  const queryNeedle = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => {
    if (!queryNeedle) return photos;
    return photos.filter((photo) => `${photo.name} ${photo.message ?? ''}`.toLocaleLowerCase().includes(queryNeedle));
  }, [photos, queryNeedle]);
  const summary = useMemo(() => photos.reduce(
    (counts, photo) => {
      if (photo.status === 'done') counts.completed += 1;
      if (photo.status === 'error') counts.failed += 1;
      return counts;
    },
    { completed: 0, failed: 0 },
  ), [photos]);
  const { completed, failed } = summary;
  const activePhoto = useMemo(
    () => photos.find((photo) => photo.id === activePhotoId),
    [activePhotoId, photos],
  );

  useEffect(() => {
    const receivedNewInitialPhoto = initialPhotoId && initialPhotoId !== lastInitialPhotoId.current;
    if (receivedNewInitialPhoto) {
      lastInitialPhotoId.current = initialPhotoId;
      if (photos.some((photo) => photo.id === initialPhotoId)) {
        setActivePhotoId(initialPhotoId);
        return;
      }
    } else if (!initialPhotoId) {
      lastInitialPhotoId.current = undefined;
    }
    setActivePhotoId((current) => {
      if (current && filtered.some((photo) => photo.id === current)) return current;
      return filtered[0]?.id ?? (query.trim() ? '' : photos[0]?.id ?? '');
    });
  }, [filtered, initialPhotoId, photos, query]);

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
  useEffect(() => {
    if (!activePhoto) return;
    void loadImage(activePhoto);
    if (activePhoto.status === 'done') void loadResult(activePhoto);
  }, [activePhoto?.id, activePhoto?.status]);

  const activatePhoto = useCallback((photo: YoloPhoto) => {
    setError('');
    setActivePhotoId(photo.id);
  }, []);
  const exportResults = async () => {
    const rows = filtered;
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

  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || resizeRef.current) return;
    const bodyWidth = bodyRef.current?.getBoundingClientRect().width ?? 0;
    if (!bodyWidth) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidthPercent: listWidthPercentRef.current,
      bodyWidth,
    };
    setResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId || !event.isPrimary) return;
    event.preventDefault();
    const deltaPercent = ((event.clientX - resize.startX) / resize.bodyWidth) * 100;
    const next = Math.min(
      maxResultsListPercent(resize.bodyWidth),
      Math.max(0, resize.startWidthPercent + deltaPercent),
    );
    listWidthPercentRef.current = next;
    setListWidthPercent(next);
  };

  const handleResizeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId || !event.isPrimary) return;
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const finalWidth = listWidthPercentRef.current;
    if (finalWidth > 0) expandedListWidthRef.current = finalWidth;
    else if (resize.startWidthPercent > 0) expandedListWidthRef.current = resize.startWidthPercent;
    setResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  const toggleList = () => {
    if (listWidthPercentRef.current === 0) {
      const bodyWidth = bodyRef.current?.getBoundingClientRect().width ?? 0;
      const max = maxResultsListPercent(bodyWidth);
      const next = Math.min(expandedListWidthRef.current, max || RESULTS_LIST_MAX_PERCENT);
      listWidthPercentRef.current = next || RESULTS_LIST_DEFAULT_PERCENT;
      setListWidthPercent(next || RESULTS_LIST_DEFAULT_PERCENT);
      return;
    }
    expandedListWidthRef.current = listWidthPercentRef.current;
    listWidthPercentRef.current = 0;
    setListWidthPercent(0);
  };

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const bodyWidth = bodyRef.current?.getBoundingClientRect().width ?? 0;
    const max = maxResultsListPercent(bodyWidth);
    const step = event.shiftKey ? 8 : 2;
    const currentWidth = listWidthPercentRef.current;
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? max
        : Math.min(
          max,
          Math.max(0, currentWidth + (event.key === 'ArrowLeft' ? -step : step)),
        );
    if (next > 0) expandedListWidthRef.current = next;
    else if (currentWidth > 0) expandedListWidthRef.current = currentWidth;
    listWidthPercentRef.current = next;
    setListWidthPercent(next);
  };

  const listCollapsed = listWidthPercent === 0;
  const maxListPercent = maxResultsListPercent(bodyRef.current?.getBoundingClientRect().width ?? 0);

  return <section className={styles.panel} aria-labelledby="yolo-results-title">
    <header className={styles.header}>
      <div className={styles.headerCopy}>
        <span className={styles.eyebrow}>图片识别</span>
        <h2 id="yolo-results-title">图片识别结果</h2>
        <p>{photos.length} 张图片，完成 {completed.length} 张</p>
      </div>
      <div className={styles.summary} aria-label="识别结果概览">
        <span><b>{completed.length}</b> 已完成</span>
        <span><b>{failed.length}</b> 失败</span>
      </div>
    </header>
    <div className={styles.toolbar}>
      <label className={styles.search}><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选图片或结果" aria-label="筛选图片或结果" /></label>
      <button type="button" className={styles.exportButton} disabled={!filtered.length || exporting} onClick={() => void exportResults()}>
        {exporting ? <LoadingIcon /> : <Download size={15} />} 导出 {filtered.length} 项
      </button>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div
      ref={bodyRef}
      className={styles.body}
      style={{ '--results-list-width': `${listWidthPercent}%` } as CSSProperties}
    >
      <aside
        className={styles.list}
        data-view={viewMode}
        data-collapsed={listCollapsed}
        style={{ '--thumbnail-size': `${thumbnailSize}px` } as CSSProperties}
        aria-label="图片结果列表"
      >
        <div className={styles.listHeading}>
          <div className={styles.listHeadingCopy}><strong>图片</strong><span>{filtered.length} 项</span></div>
          <div className={styles.viewControls} aria-label="图片排列方式">
            <button type="button" className={styles.iconButton} data-active={viewMode === 'list'} aria-label="列表视图" aria-pressed={viewMode === 'list'} title="列表视图" onClick={() => setViewMode('list')}><List size={15} /></button>
            <button type="button" className={styles.iconButton} data-active={viewMode === 'grid'} aria-label="图标视图" aria-pressed={viewMode === 'grid'} title="图标视图" onClick={() => setViewMode('grid')}><LayoutGrid size={15} /></button>
          </div>
        </div>
        <label className={styles.sizeControl}>
          <ZoomOut size={14} aria-hidden />
          <input
            type="range"
            min={THUMBNAIL_MIN}
            max={THUMBNAIL_MAX}
            step="1"
            value={thumbnailSize}
            aria-label="缩略图大小"
            aria-valuetext={`${thumbnailSize}px`}
            onChange={(event) => setThumbnailSize(Number(event.target.value))}
          />
          <ZoomIn size={14} aria-hidden />
        </label>
        {!filtered.length && <p className={styles.empty}>没有匹配的图片</p>}
        <div className={styles.listItems} role="listbox" aria-label="选择图片查看详情">
          {filtered.map((photo) => <ResultRow
            key={photo.id}
            photo={photo}
            active={activePhoto?.id === photo.id}
            onActivate={activatePhoto}
          />)}
        </div>
      </aside>
      <div
        className={styles.resizeHandle}
        data-collapsed={listCollapsed}
        data-resizing={resizing}
        role="separator"
        aria-label="调整图片列表宽度"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={Math.round(maxListPercent)}
        aria-valuenow={Math.round(listWidthPercent)}
        aria-valuetext={listCollapsed ? '图片列表已收起' : `${Math.round(listWidthPercent)}%`}
        tabIndex={0}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        onKeyDown={handleResizeKeyDown}
      >
        <span className={styles.resizeGrip} aria-hidden="true" />
      </div>
      <button
        type="button"
        className={styles.resizeToggle}
        data-collapsed={listCollapsed}
        aria-label={listCollapsed ? '展开图片列表' : '收起图片列表'}
        title={listCollapsed ? '展开图片列表' : '收起图片列表'}
        onClick={toggleList}
      >
        {listCollapsed ? <ChevronRight size={13} aria-hidden /> : <ChevronLeft size={13} aria-hidden />}
      </button>
      <section className={styles.comparison} aria-label="图片预览与识别结果">
        {!activePhoto && <div className={styles.emptyComparison}><ImageIcon size={24} /><p>{photos.length ? '没有匹配的图片' : '添加图片后，在这里查看原图和推理结果'}</p></div>}
        {activePhoto && <article className={styles.detail}>
          <header className={styles.detailHeader}>
            <div className={styles.detailTitle}><span className={styles.eyebrow}>当前图片 · {activePhotoIndex(activePhoto, photos)} / {photos.length}</span><h3 title={activePhoto.name}>{activePhoto.name}</h3></div>
            <div className={styles.detailState}><span className={styles.status} data-status={activePhoto.status}>{statusLabel(activePhoto)}</span><strong>{countLabel(activePhoto)}</strong></div>
          </header>
          <div className={styles.imagePair}>
            <figure className={styles.previewCard}>
              <div className={styles.previewFrame}>
                {(activePhoto.previewUrl || activePhoto.url) ? <img src={activePhoto.previewUrl || activePhoto.url} alt={`${activePhoto.name} 原图`} /> : loadingImages.includes(activePhoto.id) ? <LoadingIcon /> : <button type="button" onClick={() => void loadImage(activePhoto)} title="加载原图"><ImageIcon size={24} /><span>加载原图</span></button>}
              </div>
              <figcaption><strong>原图</strong><span>源文件预览</span></figcaption>
            </figure>
            <figure className={styles.previewCard}>
              <div className={`${styles.previewFrame} ${!activePhoto.resultUrl ? styles.previewPlaceholder : ''}`}>
                {activePhoto.resultUrl ? <img src={activePhoto.resultUrl} alt={`${activePhoto.name} 推理结果`} /> : loadingResults.includes(activePhoto.id) ? <LoadingIcon /> : activePhoto.status === 'done' ? <button type="button" onClick={() => void loadResult(activePhoto)} title="生成标注结果图"><ImageIcon size={24} /><span>加载推理结果</span></button> : <span>{resultLabel(activePhoto)}</span>}
              </div>
              <figcaption><strong>推理结果</strong><span>{resultLabel(activePhoto)}</span></figcaption>
            </figure>
          </div>
          <div className={styles.detailSummary} aria-label="当前图片识别信息">
            <div><span>处理状态</span><strong>{statusLabel(activePhoto)}</strong></div>
            <div><span>识别数量</span><strong>{countLabel(activePhoto)}</strong></div>
            <div><span>推理模型</span><strong title={activePhoto.modelId}>{activePhoto.modelId || 'YOLO · ONNX'}</strong></div>
          </div>
          <p className={styles.detailMessage}>{activePhoto.message || '尚未返回推理摘要'}</p>
          {activePhoto.counts && Object.keys(activePhoto.counts).length > 0 && <div className={styles.counts}>{Object.entries(activePhoto.counts).map(([name, count]) => <span key={name}>{name} <b>{count}</b></span>)}</div>}
        </article>}
      </section>
    </div>
  </section>;
}

function activePhotoIndex(photo: YoloPhoto, photos: YoloPhoto[]) {
  const index = photos.findIndex((item) => item.id === photo.id);
  return index >= 0 ? index + 1 : 1;
}
