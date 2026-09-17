/* 可移动、可调宽的 Agent 对话工作台。
 * Created on 2026-09-14
 * Updated on 2026-09-17
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
  type PanInfo,
} from 'motion/react';
import { isTauri } from '@tauri-apps/api/core';
import {
  ArrowLeftRight,
  Folder,
  GripVertical,
  MessageSquare,
  PanelLeft,
  PanelRight,
  Plus,
  RefreshCw,
  Search,
  Settings,
  X,
} from 'lucide-react';
import SettingsModal from '../features/settings/components/SettingsModal';
import type { Project } from '../features/workspace/types';
import styles from './AgentShell.module.css';
import YoloTaskCard, { type YoloTask } from '../features/workspace/components/YoloTaskCard';
import SystemResourceCard from '../features/workspace/components/SystemResourceCard';
import {
  DEFAULT_PANEL_LAYOUT,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  persistPanelLayout,
  readPanelLayout,
  type PanelId,
  type PanelLayout,
  type WorkbenchModuleId,
} from './panelLayout';
const PANEL_COMPACT_WIDTH = 84;
const COMPACT_LAYOUT_QUERY = '(max-width: 980px)';

export default function AgentShell({
  children,
  workbench,
  workbenchOpen,
  onToggleWorkbench,
  projects,
  projectId,
  busy,
  onNewConversation,
  onSwitchProject,
  onOpenYoloResults,
  yoloTask,
}: {
  children: ReactNode;
  workbench: ReactNode | ((layout: PanelLayout) => ReactNode);
  workbenchOpen: boolean;
  onToggleWorkbench: () => void;
  projects: Project[];
  projectId?: string;
  busy: boolean;
  onNewConversation: () => void;
  onSwitchProject: (id: string) => void;
  onOpenYoloResults: (photoId?: string) => void;
  yoloTask: YoloTask;
}) {
  const [layout, setLayout] = useState<PanelLayout>(readPanelLayout);
  const workbenchContent =
    typeof workbench === 'function' ? workbench(layout) : workbench;
  const leftPanel: PanelId = layout.reversed ? 'workbench' : 'navigation';
  const rightPanel: PanelId = leftPanel === 'navigation' ? 'workbench' : 'navigation';
  const nativeWindow = isTauri();
  const mac = /Mac/i.test(navigator.platform);
  const [navigationOpen, setNavigationOpen] = useState(true);
  const [narrow, setNarrow] = useState(
    () => window.matchMedia(COMPACT_LAYOUT_QUERY).matches,
  );
  const [mobilePanel, setMobilePanel] = useState<PanelId | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState<PanelId | null>(null);
  const [resizing, setResizing] = useState<PanelId | null>(null);
  const [targetSide, setTargetSide] = useState<'left' | 'right' | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    id: number;
    x: number;
    panel: PanelId;
    width: number;
    resize: boolean;
  } | null>(null);
  const navigationDrag = useDragControls();
  const workbenchDrag = useDragControls();
  const dragDelay = useRef<number | null>(null);
  const dragArmed = useRef<PanelId | null>(null);
  const dragMoved = useRef(false);
  const dragStart = useRef<{
    id: number;
    x: number;
    y: number;
    event: PointerEvent;
    target: HTMLElement;
  } | null>(null);
  const resizeFrame = useRef<number | null>(null);
  const pendingResize = useRef<{ id: PanelId; width: number } | null>(null);
  const menu = useRef<HTMLMenuElement>(null);
  const menuTrigger = useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion();
  const reloadApplication = () => {
    window.location.reload();
  };
  const renderWorkbenchModule = (moduleId: WorkbenchModuleId) => {
    if (moduleId === 'imageRecognition') {
      if (!layout.showImageRecognition) return null;
      return (
        <div
          key={moduleId}
          className={styles.moduleSlot}
          data-workbench-module="imageRecognition"
        >
          <YoloTaskCard
            task={yoloTask}
            density={layout.imageRecognitionDensity}
            onOpenResults={onOpenYoloResults}
          />
        </div>
      );
    }
    if (moduleId === 'resourceMonitor') {
      if (!layout.showResourceMonitor) return null;
      return (
        <div
          key={moduleId}
          className={styles.moduleSlot}
          data-workbench-module="resourceMonitor"
        >
          <SystemResourceCard density={layout.resourceMonitorDensity} />
        </div>
      );
    }
    return (
      <div
        key={moduleId}
        className={`${styles.moduleSlot} ${styles.taskModuleSlot}`}
        data-workbench-module="taskPanel"
      >
        {workbenchContent}
      </div>
    );
  };
  const cancelDragDelay = () => {
    if (dragDelay.current === null) return;
    window.clearTimeout(dragDelay.current);
    dragDelay.current = null;
  };
  const updateLayout = (updater: (current: PanelLayout) => PanelLayout, persist = false) => {
    setLayout((current) => {
      const next = updater(current);
      if (
        next.reversed === current.reversed &&
        next.navigation === current.navigation &&
        next.workbench === current.workbench &&
        next.showImageRecognition === current.showImageRecognition &&
        next.showFileTree === current.showFileTree &&
        next.showResourceMonitor === current.showResourceMonitor &&
        next.workbenchOrder.join('|') === current.workbenchOrder.join('|') &&
        next.imageRecognitionDensity === current.imageRecognitionDensity &&
        next.resourceMonitorDensity === current.resourceMonitorDensity
      ) {
        return current;
      }
      if (persist) persistPanelLayout(next);
      return next;
    });
  };
  const toggleNavigation = () =>
    narrow
      ? setMobilePanel((value) =>
          value === 'navigation' ? null : 'navigation',
        )
      : setNavigationOpen((value) => !value);
  const toggleWorkbench = () => {
    if (narrow) {
      setMobilePanel((value) => (value === 'workbench' ? null : 'workbench'));
      if (!workbenchOpen) onToggleWorkbench();
    } else onToggleWorkbench();
  };
  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, []);
  useEffect(() => () => {
    cancelDragDelay();
    if (resizeFrame.current !== null) window.cancelAnimationFrame(resizeFrame.current);
  }, []);
  useEffect(() => {
    const media = window.matchMedia(COMPACT_LAYOUT_QUERY);
    const update = () => {
      setNarrow(media.matches);
      setMobilePanel(null);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        const target = event.shiftKey ? rightPanel : leftPanel;
        if (narrow) {
          setMobilePanel((value) => (value === target ? null : target));
          if (target === 'workbench' && !workbenchOpen) onToggleWorkbench();
        } else if (target === 'workbench') onToggleWorkbench();
        else setNavigationOpen((value) => !value);
      }
      if (event.key === 'Escape') {
        cancelDragDelay();
        gesture.current = null;
        dragArmed.current = null;
        dragStart.current = null;
        setDragging(null);
        setResizing(null);
        setTargetSide(null);
        setMobilePanel(null);
        setContextMenu(null);
        menuTrigger.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [leftPanel, onToggleWorkbench, narrow, rightPanel, workbenchOpen]);
  const swap = () =>
    updateLayout((value) => ({ ...value, reversed: !value.reversed }), true);
  const panel = (id: PanelId) => {
    const isLeft = id === leftPanel;
    const compact = id === 'navigation' && layout[id] <= PANEL_COMPACT_WIDTH;
    const label = id === 'navigation' ? '会话侧栏' : '育种台';
    const dragControls = id === 'navigation' ? navigationDrag : workbenchDrag;
    const close = () =>
      narrow
        ? setMobilePanel(null)
        : id === 'navigation'
          ? setNavigationOpen(false)
          : onToggleWorkbench();
    const begin = (event: React.PointerEvent<HTMLElement>, resize: boolean) => {
      if (!event.isPrimary || event.button !== 0 || gesture.current) return;
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = {
        id: event.pointerId,
        x: event.clientX,
        panel: id,
        width: layout[id],
        resize,
      };
      if (resize) setResizing(id);
    };
    const move = (event: React.PointerEvent<HTMLElement>) => {
      const active = gesture.current;
      if (!active || active.id !== event.pointerId) return;
      if (active.resize) {
        event.preventDefault();
        const max = PANEL_MAX_WIDTH[id];
        const width = Math.min(
          max,
          Math.max(
            PANEL_MIN_WIDTH[id],
            active.width + (event.clientX - active.x) * (isLeft ? 1 : -1),
          ),
        );
        pendingResize.current = { id, width };
        if (resizeFrame.current !== null) return;
        resizeFrame.current = window.requestAnimationFrame(() => {
          resizeFrame.current = null;
          const pending = pendingResize.current;
          pendingResize.current = null;
          if (!pending) return;
          updateLayout((value) =>
            value[pending.id] === pending.width
              ? value
              : { ...value, [pending.id]: pending.width },
          );
        });
      }
    };
    const finish = (event: React.PointerEvent<HTMLElement>) => {
      const active = gesture.current;
      if (!active || active.id !== event.pointerId) return;
      const pending = pendingResize.current;
      if (resizeFrame.current !== null) {
        window.cancelAnimationFrame(resizeFrame.current);
        resizeFrame.current = null;
      }
      pendingResize.current = null;
      gesture.current = null;
      setResizing(null);
      if (active.resize) {
        const width = pending?.id === id ? pending.width : layout[id];
        updateLayout(
          (value) => (value[id] === width ? value : { ...value, [id]: width }),
          true,
        );
      }
    };
    const cancel = () => {
      gesture.current = null;
      if (resizeFrame.current !== null) {
        window.cancelAnimationFrame(resizeFrame.current);
        resizeFrame.current = null;
      }
      pendingResize.current = null;
      setResizing(null);
    };
    const updateDragTarget = (info: PanInfo) => {
      const bounds = root.current?.getBoundingClientRect();
      if (!bounds) return;
      setTargetSide(
        info.point.x < bounds.left + bounds.width / 2 ? 'left' : 'right',
      );
    };
    const finishDrag = (
      _event: MouseEvent | TouchEvent | PointerEvent,
      info: PanInfo,
    ) => {
      const bounds = root.current?.getBoundingClientRect();
      if (bounds && dragArmed.current === id) {
        const projectedX = info.point.x + info.velocity.x * 0.1;
        const finalSide =
          projectedX < bounds.left + bounds.width / 2 ? 'left' : 'right';
        if ((finalSide === 'left') !== isLeft) swap();
      }
      cancelDragDelay();
      dragArmed.current = null;
      dragStart.current = null;
      dragMoved.current = false;
      setDragging(null);
      setTargetSide(null);
    };
    return (
      <motion.aside
        key={id}
        layout={resizing ? false : 'position'}
        initial={{ opacity: 0 }}
        animate={{
          opacity: dragging && dragging !== id ? 0.62 : 1,
          filter: !reduced && dragging && dragging !== id ? 'blur(2px)' : 'blur(0px)',
          y: !reduced && dragging === id ? -4 : 0,
          scale: !reduced && dragging === id ? 1.008 : 1,
        }}
        exit={{ opacity: 0, scale: reduced ? 1 : 0.985 }}
        transition={
          reduced || resizing
            ? { duration: 0 }
            : {
                layout: {
                  type: 'spring',
                  stiffness: 420,
                  damping: 38,
                  mass: 0.8,
                },
                opacity: { duration: 0.14 },
                filter: { duration: 0.14 },
                scale: { duration: 0.14 },
                y: { type: 'spring', stiffness: 430, damping: 34, mass: 0.7 },
              }
        }
        drag={narrow ? false : 'x'}
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragSnapToOrigin
        dragTransition={{ bounceStiffness: 430, bounceDamping: 34 }}
        onDrag={(_event, info) => {
          if (dragArmed.current !== id) return;
          if (Math.abs(info.offset.x) > 8) dragMoved.current = true;
          updateDragTarget(info);
        }}
        onDragEnd={finishDrag}
        className={styles.panel}
        style={{
          width: layout[id],
          order: isLeft ? 0 : 2,
        }}
        data-side={isLeft ? 'left' : 'right'}
        data-drag-source={dragging === id ? 'true' : undefined}
        data-drag-peer={dragging && dragging !== id ? 'true' : undefined}
        data-compact={compact ? 'true' : undefined}
        aria-label={label}
      >
        <div className={styles.panelHeader}>
          <button
            className={styles.grip}
            aria-label={`拖动${label}，或用左右方向键换位`}
            title="拖动到窗口另一侧"
            onPointerDown={(event) => {
              if (narrow || !event.isPrimary || event.button !== 0) return;
              event.preventDefault();
              cancelDragDelay();
              dragMoved.current = false;
              const nativeEvent = event.nativeEvent;
              const pointerId = event.pointerId;
              dragStart.current = {
                id: pointerId,
                x: event.clientX,
                y: event.clientY,
                event: nativeEvent,
                target: event.currentTarget,
              };
              event.currentTarget.setPointerCapture(pointerId);
              dragDelay.current = window.setTimeout(() => {
                dragDelay.current = null;
                const start = dragStart.current;
                if (start?.id !== pointerId) return;
                if (start.target.hasPointerCapture(pointerId)) {
                  start.target.releasePointerCapture(pointerId);
                }
                dragArmed.current = id;
                setDragging(id);
                setTargetSide(isLeft ? 'left' : 'right');
                dragControls.start(start.event);
              }, 180);
            }}
            onPointerMove={(event) => {
              const start = dragStart.current;
              if (!start || start.id !== event.pointerId || dragArmed.current === id) return;
              if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) {
                cancelDragDelay();
                dragStart.current = null;
              }
            }}
            onPointerUp={(event) => {
              cancelDragDelay();
              if (dragArmed.current === id && !dragMoved.current) {
                dragArmed.current = null;
                setDragging(null);
                setTargetSide(null);
              }
              dragStart.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={(event) => {
              cancelDragDelay();
              dragArmed.current = null;
              dragMoved.current = false;
              dragStart.current = null;
              setDragging(null);
              setTargetSide(null);
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                if ((event.key === 'ArrowLeft') !== isLeft) swap();
              }
            }}
          >
            {compact ? (
              id === 'navigation' ? <PanelLeft size={17} /> : <PanelRight size={17} />
            ) : (
              <GripVertical size={14} />
            )}
            <span>{id === 'navigation' ? '工作空间' : '育种台'}</span>
          </button>
          <button
            aria-label={`移动${label}到${isLeft ? '右' : '左'}侧`}
            title="移动到另一侧"
            onClick={swap}
          >
            <ArrowLeftRight size={14} />
          </button>
          <button
            aria-label={id === 'navigation' ? '收起会话侧栏' : '收起育种台'}
            onClick={close}
          >
            <X size={15} />
          </button>
        </div>
        {id === 'navigation' ? (
          <nav className={styles.navigation} aria-label="会话与项目">
            <button
              className={styles.newChat}
              disabled={busy}
              onClick={onNewConversation}
            >
              <Plus size={17} />
              <span>新的临时会话</span>
            </button>
            <label className={styles.search}>
              <Search size={15} />
              <input
                aria-label="搜索项目"
                placeholder="搜索项目…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className={styles.sectionLabel}>当前对话</div>
            <div className={styles.current}>
              <MessageSquare size={16} />
              <span>
                {projectId
                  ? projects.find((p) => p.id === projectId)?.name || '项目对话'
                  : '临时会话'}
              </span>
              <i />
            </div>
            <div className={styles.sectionLabel}>
              项目{' '}
              <span>
                {projects.filter((p) => p.status === 'active').length}
              </span>
            </div>
            <div className={styles.projectList}>
              {projects
                .filter(
                  (p) =>
                    p.status === 'active' &&
                    p.name.toLowerCase().includes(query.toLowerCase()),
                )
                .map((project) => (
                  <button
                    key={project.id}
                    disabled={busy}
                    aria-current={project.id === projectId ? 'page' : undefined}
                    onClick={() => onSwitchProject(project.id)}
                  >
                    <Folder size={16} />
                    <span>{project.name}</span>
                  </button>
                ))}
              {!projects.some(
                (p) =>
                  p.status === 'active' &&
                  p.name.toLowerCase().includes(query.toLowerCase()),
              ) && (
                <p className={styles.empty}>
                  {query
                    ? '没有匹配的项目'
                    : '把对话保存为项目，\n让研究在这里继续。'}
                </p>
              )}
            </div>
            <div className={styles.navFooter}>
              <button aria-label="打开设置" onClick={() => setSettingsOpen(true)}>
                <Settings size={16} />
                <span>设置</span>
              </button>
              <span>lian / 研究助手</span>
            </div>
          </nav>
        ) : (
          <div className={styles.panelBody}>
            {layout.workbenchOrder.map(renderWorkbenchModule)}
          </div>
        )}
        <div
          className={styles.resize}
          role="separator"
          tabIndex={0}
          aria-label={`调整${label}宽度`}
          aria-orientation="vertical"
          aria-valuenow={layout[id]}
          aria-valuemin={PANEL_MIN_WIDTH[id]}
          aria-valuemax={PANEL_MAX_WIDTH[id]}
          onPointerDown={(event) => begin(event, true)}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={cancel}
          onLostPointerCapture={cancel}
          onDoubleClick={() =>
            updateLayout(
              (value) => ({ ...value, [id]: DEFAULT_PANEL_LAYOUT[id] }),
              true,
            )
          }
          onKeyDown={(event) => {
            if (
              ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
            ) {
              event.preventDefault();
              const max = PANEL_MAX_WIDTH[id];
              updateLayout(
                (value) => ({
                  ...value,
                  [id]:
                    event.key === 'Home'
                      ? PANEL_MIN_WIDTH[id]
                      : event.key === 'End'
                        ? max
                        : Math.max(
                            PANEL_MIN_WIDTH[id],
                            Math.min(
                              max,
                              value[id] +
                                (event.key === 'ArrowRight' ? 16 : -16) *
                                  (isLeft ? 1 : -1),
                            ),
                          ),
                }),
                true,
              );
            }
          }}
        />
      </motion.aside>
    );
  };
  const visible = (id: PanelId) =>
    narrow
      ? mobilePanel === id
        : id === 'navigation'
          ? navigationOpen
          : workbenchOpen;
  const togglePanelAtSide = (side: 'left' | 'right') => {
    const id = side === 'left' ? leftPanel : rightPanel;
    if (id === 'navigation') toggleNavigation();
    else toggleWorkbench();
  };
  return (
    <div
      className={styles.shell}
      ref={root}
      data-resizing={resizing ? 'true' : undefined}
      onContextMenu={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('input, textarea, select, option, button, a, [contenteditable], pre, code')) return;
        event.preventDefault();
        menuTrigger.current = target;
        setContextMenu({
          x: Math.min(event.clientX, window.innerWidth - 230),
          y: Math.min(event.clientY, window.innerHeight - 190),
        });
      }}
    >
      <header
        className={styles.titlebar}
        aria-label="工作空间顶部栏"
        data-native-mac={nativeWindow && mac ? 'true' : undefined}
        data-tauri-drag-region={nativeWindow ? '' : undefined}
        onContextMenu={(event) => event.stopPropagation()}
      >
        <span className={styles.wordmark}>
          lian<span> / </span>
          <small>研究工作空间</small>
        </span>
        <div>
          <button
            aria-label={visible(leftPanel) ? '收起左侧边栏' : '展开左侧边栏'}
            title={`左侧边栏 · ${mac ? '⌘B' : 'Ctrl+B'}`}
            onClick={() => togglePanelAtSide('left')}
          >
            <PanelLeft size={17} />
          </button>
          <button
            aria-label={visible(rightPanel) ? '收起右侧边栏' : '展开右侧边栏'}
            title={`右侧边栏 · ${mac ? '⌘⇧B' : 'Ctrl+Shift+B'}`}
            onClick={() => togglePanelAtSide('right')}
          >
            <PanelRight size={17} />
          </button>
          <button
            aria-label="刷新应用"
            title="重新载入应用窗口"
            onClick={reloadApplication}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </header>
      <div className={styles.body}>
        {dragging && (
          <div
            className={styles.panelPlaceholder}
            data-side={dragging === leftPanel ? 'left' : 'right'}
            style={{ width: layout[dragging] }}
            aria-hidden="true"
          />
        )}
        <AnimatePresence initial={false} mode="popLayout">
          {visible('navigation') && panel('navigation')}
          <motion.div
            key="conversation"
            layout={!resizing}
            className={styles.center}
            style={{ order: 1 }}
            transition={
              reduced || resizing
                ? { duration: 0 }
                : {
                    layout: {
                      type: 'spring',
                      stiffness: 420,
                      damping: 38,
                      mass: 0.8,
                    },
                  }
            }
          >
            {children}
          </motion.div>
          {visible('workbench') && panel('workbench')}
        </AnimatePresence>
        {narrow && mobilePanel && (
          <button
            className={styles.scrim}
            aria-label="关闭侧栏遮罩"
            onClick={() => setMobilePanel(null)}
          />
        )}
      </div>
      {dragging && (
        <div
          className={styles.dropPreview}
          data-side={targetSide || (dragging === leftPanel ? 'left' : 'right')}
          aria-hidden="true"
        />
      )}
      {contextMenu && (
        <motion.menu
          ref={menu}
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          role="menu"
          onAnimationComplete={() => menu.current?.querySelector<HTMLButtonElement>('button')?.focus()}
          onKeyDown={(event) => {
            const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === 'Escape') {
              event.preventDefault();
              setContextMenu(null);
              menuTrigger.current?.focus();
            } else if (items.length && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
              items[next]?.focus();
            }
          }}
        >
          <li><button role="menuitem" onClick={() => { onNewConversation(); setContextMenu(null); }}><Plus size={15} />新的临时会话 <kbd>⌘N</kbd></button></li>
          <li><button role="menuitem" onClick={() => { togglePanelAtSide('left'); setContextMenu(null); }}><PanelLeft size={15} />{visible(leftPanel) ? '收起左侧边栏' : '展开左侧边栏'}</button></li>
          <li><button role="menuitem" onClick={() => { togglePanelAtSide('right'); setContextMenu(null); }}><PanelRight size={15} />{visible(rightPanel) ? '收起右侧边栏' : '展开右侧边栏'}</button></li>
          <li className={styles.menuDivider} />
          <li><button role="menuitem" onClick={() => { setContextMenu(null); reloadApplication(); }}><RefreshCw size={15} />刷新应用</button></li>
      </motion.menu>
      )}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        layout={layout}
        onLayoutChange={(next) =>
          updateLayout(
            (value) => ({
              ...value,
              reversed: next.reversed,
              workbench: next.workbench,
              showImageRecognition: next.showImageRecognition,
              showFileTree: next.showFileTree,
              showResourceMonitor: next.showResourceMonitor,
              workbenchOrder: [...next.workbenchOrder],
              imageRecognitionDensity: next.imageRecognitionDensity,
              resourceMonitorDensity: next.resourceMonitorDensity,
            }),
            true,
          )
        }
      />
    </div>
  );
}
