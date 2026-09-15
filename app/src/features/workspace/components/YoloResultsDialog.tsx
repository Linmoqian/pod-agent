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
  LayoutGrid,
  ImageIcon,
  Layers,
  List,
  LoaderCircle,
  Search,
  Split,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ImagePreviewOptions, YoloPhoto, YoloTask } from './YoloTaskCard';
import styles from './YoloResultsDialog.module.css';

type YoloResultsPanelProps = Pick<
  YoloTask,
  'photos' | 'loadThumbnail' | 'loadImagePreview' | 'loadResultPreview' | 'exportCsv'
> & {
  initialPhotoId?: string;
};

const THUMBNAIL_MIN = 108;
const THUMBNAIL_MAX = 240;
const THUMBNAIL_DEFAULT = 142;
const RESULTS_LIST_DEFAULT_PERCENT = 31;
const RESULTS_LIST_MIN_WIDTH = 224;
const RESULTS_LIST_MAX_PERCENT = 72;
const RESULTS_COMPARISON_MIN_WIDTH = 320;
const RESULTS_DIVIDER_WIDTH = 16;
const COMPARE_ZOOM_MIN = 1;
const COMPARE_ZOOM_MAX = 2.5;
const COMPARE_ZOOM_STEP = 0.1;

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
  loadThumbnail,
}: {
  photo: YoloPhoto;
  active: boolean;
  onActivate: (photo: YoloPhoto) => void;
  loadThumbnail: (photo: YoloPhoto) => Promise<string | undefined>;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);
  const loadThumbnailRef = useRef(loadThumbnail);
  const photoRef = useRef(photo);
  const [thumbnailUrl, setThumbnailUrl] = useState(photo.url);
  const [thumbnailLoading, setThumbnailLoading] = useState(false);
  loadThumbnailRef.current = loadThumbnail;
  photoRef.current = photo;

  useEffect(() => {
    let disposed = false;
    const currentPhoto = photoRef.current;
    setThumbnailUrl(currentPhoto.url);
    if (currentPhoto.url) return;
    const row = rowRef.current;
    if (!row) return;
    const load = () => {
      if (disposed) return;
      setThumbnailLoading(true);
      void loadThumbnailRef.current(currentPhoto)
        .then((url) => {
          if (!disposed && url) setThumbnailUrl(url);
        })
        .catch(() => {})
        .finally(() => {
          if (!disposed) setThumbnailLoading(false);
        });
    };
    if (typeof IntersectionObserver === 'undefined') {
      load();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      load();
    }, { rootMargin: '160px' });
    observer.observe(row);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [photo.id, photo.url]);

  return <button
    type="button"
    className={styles.row}
    ref={rowRef}
    data-active={active}
    role="option"
    aria-selected={active}
    onClick={() => onActivate(photo)}
  >
    {thumbnailUrl
      ? <img className={styles.rowThumb} src={thumbnailUrl} alt="" onError={() => setThumbnailUrl(undefined)} />
      : <span className={`${styles.rowThumb} ${styles.imageFallback}`}>{thumbnailLoading ? <LoadingIcon /> : <ImageIcon size={16} />}</span>}
    <span className={styles.rowCopy}><strong title={photo.name}>{photo.name}</strong><small>{countLabel(photo)}</small></span>
    <span className={styles.status} data-status={photo.status}>{statusLabel(photo)}</span>
  </button>;
});

function maxResultsListPercent(bodyWidth: number) {
  if (!bodyWidth) return RESULTS_LIST_MAX_PERCENT;
  const available = bodyWidth - RESULTS_COMPARISON_MIN_WIDTH - RESULTS_DIVIDER_WIDTH;
  return Math.max(
    minResultsListPercent(bodyWidth),
    Math.min(RESULTS_LIST_MAX_PERCENT, (available / bodyWidth) * 100),
  );
}

function minResultsListPercent(bodyWidth: number) {
  if (!bodyWidth) return 0;
  return Math.min(100, (RESULTS_LIST_MIN_WIDTH / bodyWidth) * 100);
}

export default function YoloResultsPanel({
  photos,
  initialPhotoId,
  loadThumbnail,
  loadImagePreview,
  loadResultPreview,
  exportCsv,
}: YoloResultsPanelProps) {
  const [query, setQuery] = useState('');
  const [activePhotoId, setActivePhotoId] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [thumbnailSize, setThumbnailSize] = useState(THUMBNAIL_DEFAULT);
  const [compareMode, setCompareMode] = useState<'side-by-side' | 'overlay'>('side-by-side');
  const [comparePosition, setComparePosition] = useState(50);
  const [compareZoom, setCompareZoom] = useState(1);
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
  const compareFrameRef = useRef<HTMLDivElement>(null);
  const comparePointerId = useRef<number | null>(null);
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

  useEffect(() => {
    setComparePosition(50);
    setCompareZoom(COMPARE_ZOOM_MIN);
  }, [activePhotoId]);

  const loadImage = async (photo: YoloPhoto, options: ImagePreviewOptions = {}) => {
    const forceFallback = options.forceFallback === true;
    if (!forceFallback && (photo.previewUrl || loadingImages.includes(photo.id))) return;
    setLoadingImages((current) => [...current, photo.id]);
    setError('');
    try {
      await loadImagePreview(photo, options);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '原图加载失败');
    } finally {
      setLoadingImages((current) => current.filter((id) => id !== photo.id));
    }
  };
  const handleNativePreviewError = (photo: YoloPhoto) => {
    if (photo.previewSource !== 'native') return;
    void loadImage(photo, { forceFallback: true });
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
    const min = minResultsListPercent(bodyWidth);
    const max = maxResultsListPercent(bodyWidth);
    const startWidthPercent = Math.min(
      max,
      Math.max(min, listWidthPercentRef.current),
    );
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidthPercent,
      bodyWidth,
    };
    listWidthPercentRef.current = startWidthPercent;
    setListWidthPercent(startWidthPercent);
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
      Math.max(
        minResultsListPercent(resize.bodyWidth),
        resize.startWidthPercent + deltaPercent,
      ),
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

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const bodyWidth = bodyRef.current?.getBoundingClientRect().width ?? 0;
    const min = minResultsListPercent(bodyWidth);
    const max = maxResultsListPercent(bodyWidth);
    const step = event.shiftKey ? 8 : 2;
    const currentWidth = Math.max(min, listWidthPercentRef.current);
    const next = event.key === 'Home'
      ? min
      : event.key === 'End'
        ? max
        : Math.min(
          max,
          Math.max(min, currentWidth + (event.key === 'ArrowLeft' ? -step : step)),
        );
    listWidthPercentRef.current = next;
    setListWidthPercent(next);
  };

  const updateComparePosition = (clientX: number) => {
    const frame = compareFrameRef.current;
    if (!frame) return;
    const bounds = frame.getBoundingClientRect();
    if (!bounds.width) return;
    const next = ((clientX - bounds.left) / bounds.width) * 100;
    setComparePosition(Math.max(0, Math.min(100, next)));
  };

  const handleComparePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activePhoto?.resultUrl || !event.isPrimary || event.button !== 0 || comparePointerId.current !== null) return;
    event.preventDefault();
    comparePointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateComparePosition(event.clientX);
  };

  const handleComparePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (comparePointerId.current !== event.pointerId || !event.isPrimary) return;
    event.preventDefault();
    updateComparePosition(event.clientX);
  };

  const handleComparePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (comparePointerId.current !== event.pointerId || !event.isPrimary) return;
    comparePointerId.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const minListPercent = minResultsListPercent(bodyRef.current?.getBoundingClientRect().width ?? 0);
  const maxListPercent = maxResultsListPercent(bodyRef.current?.getBoundingClientRect().width ?? 0);

  return <section className={styles.panel} aria-labelledby="yolo-results-title">
    <header className={styles.header}>
      <div className={styles.headerCopy}>
        <span className={styles.eyebrow}>图片识别</span>
        <h2 id="yolo-results-title">图片识别结果</h2>
        <p>{photos.length} 张图片，完成 {completed} 张</p>
      </div>
      <div className={styles.summary} aria-label="识别结果概览">
        <span><b>{completed}</b> 已完成</span>
        <span><b>{failed}</b> 失败</span>
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
      style={{
        '--results-list-width': `${listWidthPercent}%`,
        '--results-list-min-width': `${RESULTS_LIST_MIN_WIDTH}px`,
      } as CSSProperties}
    >
      <aside
        className={styles.list}
        data-view={viewMode}
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
            loadThumbnail={loadThumbnail}
          />)}
        </div>
      </aside>
      <div
        className={styles.resizeHandle}
        data-resizing={resizing}
        role="separator"
        aria-label="调整图片列表宽度"
        aria-orientation="vertical"
        aria-valuemin={Math.round(minListPercent)}
        aria-valuemax={Math.round(maxListPercent)}
        aria-valuenow={Math.round(listWidthPercent)}
        aria-valuetext={`${Math.round(listWidthPercent)}%`}
        tabIndex={0}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        onKeyDown={handleResizeKeyDown}
      >
        <span className={styles.resizeGrip} aria-hidden="true" />
      </div>
      <section className={styles.comparison} aria-label="图片预览与识别结果">
        {!activePhoto && <div className={styles.emptyComparison}><ImageIcon size={24} /><p>{photos.length ? '没有匹配的图片' : '添加图片后，在这里查看原图和推理结果'}</p></div>}
        {activePhoto && <article className={styles.detail}>
          <header className={styles.detailHeader}>
            <div className={styles.detailTitle}><span className={styles.eyebrow}>当前图片 · {activePhotoIndex(activePhoto, photos)} / {photos.length}</span><h3 title={activePhoto.name}>{activePhoto.name}</h3></div>
            <div className={styles.detailState}><span className={styles.status} data-status={activePhoto.status}>{statusLabel(activePhoto)}</span><strong>{countLabel(activePhoto)}</strong></div>
          </header>
          <div className={styles.compareToolbar} aria-label="图片比较工具">
            <div className={styles.compareModes} role="group" aria-label="比较方式">
              <button type="button" className={styles.compareModeButton} data-active={compareMode === 'side-by-side'} aria-pressed={compareMode === 'side-by-side'} onClick={() => setCompareMode('side-by-side')}><Split size={14} aria-hidden />并排</button>
              <button type="button" className={styles.compareModeButton} data-active={compareMode === 'overlay'} aria-pressed={compareMode === 'overlay'} onClick={() => setCompareMode('overlay')}><Layers size={14} aria-hidden />拖动对比</button>
            </div>
            <label className={styles.compareZoom}>
              <ZoomOut size={14} aria-hidden />
              <input type="range" min={COMPARE_ZOOM_MIN} max={COMPARE_ZOOM_MAX} step={COMPARE_ZOOM_STEP} value={compareZoom} aria-label="比较图片缩放" aria-valuetext={`${Math.round(compareZoom * 100)}%`} onChange={(event) => setCompareZoom(Number(event.target.value))} />
              <ZoomIn size={14} aria-hidden />
              <span>{Math.round(compareZoom * 100)}%</span>
            </label>
            {compareMode === 'overlay' && <label className={styles.comparePosition}>
              <span>分界</span>
              <input type="range" min="0" max="100" step="1" value={comparePosition} disabled={!activePhoto.resultUrl} aria-label="原图与推理结果分界位置" aria-valuetext={`${Math.round(comparePosition)}% 原图`} onChange={(event) => setComparePosition(Number(event.target.value))} />
              <span>{Math.round(comparePosition)}%</span>
            </label>}
          </div>
          {compareMode === 'side-by-side' ? <div className={styles.imagePair} style={{ '--preview-zoom': compareZoom } as CSSProperties}>
            <figure className={styles.previewCard}>
              <div className={styles.previewFrame}>
                {(activePhoto.previewUrl || activePhoto.url) ? <img src={activePhoto.previewUrl || activePhoto.url} alt={`${activePhoto.name} 原图`} decoding="async" onError={() => handleNativePreviewError(activePhoto)} /> : loadingImages.includes(activePhoto.id) ? <LoadingIcon /> : <button type="button" onClick={() => void loadImage(activePhoto)} title="加载原图"><ImageIcon size={24} /><span>加载原图</span></button>}
              </div>
              <figcaption><strong>原图</strong><span>源文件预览</span></figcaption>
            </figure>
            <figure className={styles.previewCard}>
              <div className={`${styles.previewFrame} ${!activePhoto.resultUrl ? styles.previewPlaceholder : ''}`}>
                {activePhoto.resultUrl ? <img src={activePhoto.resultUrl} alt={`${activePhoto.name} 推理结果`} /> : loadingResults.includes(activePhoto.id) ? <LoadingIcon /> : activePhoto.status === 'done' ? <button type="button" onClick={() => void loadResult(activePhoto)} title="生成标注结果图"><ImageIcon size={24} /><span>加载推理结果</span></button> : <span>{resultLabel(activePhoto)}</span>}
              </div>
              <figcaption><strong>推理结果</strong><span>{resultLabel(activePhoto)}</span></figcaption>
            </figure>
          </div> : <figure className={`${styles.previewCard} ${styles.overlayCard}`}>
            <div
              ref={compareFrameRef}
              className={`${styles.compareFrame} ${!activePhoto.resultUrl ? styles.previewPlaceholder : ''}`}
              data-ready={Boolean(activePhoto.resultUrl)}
              style={{ '--compare-position': `${comparePosition}%`, '--preview-zoom': compareZoom } as CSSProperties}
              onPointerDown={handleComparePointerDown}
              onPointerMove={handleComparePointerMove}
              onPointerUp={handleComparePointerEnd}
              onPointerCancel={handleComparePointerEnd}
            >
              {(activePhoto.previewUrl || activePhoto.url) ? <img className={styles.compareBase} src={activePhoto.previewUrl || activePhoto.url} alt={`${activePhoto.name} 原图`} decoding="async" onError={() => handleNativePreviewError(activePhoto)} /> : loadingImages.includes(activePhoto.id) ? <LoadingIcon /> : <button type="button" onClick={() => void loadImage(activePhoto)} title="加载原图"><ImageIcon size={24} /><span>加载原图</span></button>}
              {activePhoto.resultUrl && <div className={styles.compareResult} aria-hidden="true"><img src={activePhoto.resultUrl} alt="" /></div>}
              {activePhoto.resultUrl && <div className={styles.compareDivider} aria-hidden="true"><span /></div>}
              {!activePhoto.resultUrl && loadingResults.includes(activePhoto.id) && <LoadingIcon />}
              {!activePhoto.resultUrl && !loadingResults.includes(activePhoto.id) && activePhoto.status === 'done' && <button type="button" onClick={() => void loadResult(activePhoto)} title="生成标注结果图"><ImageIcon size={24} /><span>加载推理结果</span></button>}
              {!activePhoto.resultUrl && !loadingResults.includes(activePhoto.id) && activePhoto.status !== 'done' && <span>{resultLabel(activePhoto)}</span>}
              {activePhoto.resultUrl && <div className={styles.compareLabels} aria-hidden="true"><span>原图</span><span>推理结果</span></div>}
            </div>
            <figcaption><strong>拖动分界线比较</strong><span>{activePhoto.resultUrl ? `${Math.round(comparePosition)}% 原图` : resultLabel(activePhoto)}</span></figcaption>
          </figure>}
          <div className={styles.detailSummary} aria-label="当前图片识别信息">
            <div><span>处理状态</span><strong>{statusLabel(activePhoto)}</strong></div>
            <div><span>识别数量</span><strong>{countLabel(activePhoto)}</strong></div>
            <div><span>推理模型</span><strong title={activePhoto.modelId}>{activePhoto.modelId || '未指定模型'}</strong></div>
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
