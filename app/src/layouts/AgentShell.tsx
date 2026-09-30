/* 可移动、可调宽的 Agent 对话工作台。
 * Created on 2026-09-14
 * Updated on 2026-09-17
 * @author: https://github.com/Linmoqian
 */
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useDragControls,
  useReducedMotion,
  type PanInfo,
} from 'motion/react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  Activity,
  ArrowLeftRight,
  Copy,
  Folder,
  GripVertical,
  ListChecks,
  MessageSquare,
  Minus,
  PanelLeft,
  PanelRight,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  Settings,
  Sprout,
  Square,
  X,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import SettingsModal from '../features/settings/components/SettingsModal';
import { useSystemResources } from '../features/workspace/hooks/useSystemResources';
import type { Project } from '../features/workspace/types';
import styles from './AgentShell.module.css';
import YoloTaskCard, { type YoloTask } from '../features/workspace/components/YoloTaskCard';
import SystemResourceCard from '../features/workspace/components/SystemResourceCard';
import {
  DEFAULT_PANEL_LAYOUT,
  PANEL_COMPACT_WIDTH,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  persistPanelLayout,
  readPanelLayout,
  type PanelId,
  type PanelLayout,
  type WorkbenchModuleId,
} from './panelLayout';
import {
  REDUCED_MOTION_TRANSITION,
  SPRING_LAYOUT,
} from '../utils/motion';
const COMPACT_LAYOUT_QUERY = '(max-width: 980px)';
const PANEL_MOTION_EASE = [0.23, 1, 0.32, 1] as const;
const PANEL_ENTER_TRANSITION = {
  duration: 0.18,
  delay: 0.04,
  ease: PANEL_MOTION_EASE,
};
const PANEL_EXIT_TRANSITION = {
  duration: 0.14,
  ease: PANEL_MOTION_EASE,
};
type AddableWorkbenchModuleId = Exclude<WorkbenchModuleId, 'taskPanel'>;
type WorkbenchRenderer = (
  layout: PanelLayout,
  onAddModule: (moduleId: AddableWorkbenchModuleId) => void,
  onCloseModule: (moduleId: AddableWorkbenchModuleId) => void,
) => ReactNode;

/* 侧栏压到最扁时按钮只剩图标，用提示补回语义；展开态直接返回子元素，不额外包一层。 */
function Hint({
  label,
  enabled,
  side = 'right',
  children,
}: {
  label: string;
  enabled: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactElement;
}) {
  if (!enabled) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

const WORKBENCH_MODULE_META: Record<
  WorkbenchModuleId,
  { label: string; icon: ReactElement }
> = {
  taskPanel: { label: '任务', icon: <ListChecks size={17} /> },
  imageRecognition: { label: '图片识别', icon: <ScanLine size={17} /> },
  resourceMonitor: { label: '计算机资源', icon: <Activity size={17} /> },
};

/* 育种台压到最扁时的模块图标柱：徽标给出关键数字，悬停看详情，点击用浮层承载完整模块。
 * 资源轮询放在这里，只有图标柱真正挂载时才会发起请求。 */
function WorkbenchRail({
  order,
  yoloTask,
  taskCounts,
  activeModule,
  side,
  onOpenModule,
}: {
  order: WorkbenchModuleId[];
  yoloTask: YoloTask;
  taskCounts?: { pending: number; total: number };
  activeModule: WorkbenchModuleId | null;
  side: 'left' | 'right';
  onOpenModule: (moduleId: WorkbenchModuleId) => void;
}) {
  const { snapshot } = useSystemResources();
  const photos = yoloTask.photos;
  const pendingPhotos = photos.filter(
    (photo) => photo.status !== 'done' && photo.status !== 'error',
  ).length;
  const donePhotos = photos.filter((photo) => photo.status === 'done').length;
  const cpuPercent = snapshot ? Math.round(snapshot.cpuPercent) : null;
  const memoryPercent = snapshot ? Math.round(snapshot.memoryPercent) : null;

  const hints: Record<WorkbenchModuleId, string> = {
    taskPanel: taskCounts
      ? `任务 · 进行中 ${taskCounts.pending} 项，共 ${taskCounts.total} 项`
      : '任务',
    imageRecognition: photos.length
      ? `图片识别 · 待处理 ${pendingPhotos} 张，已完成 ${donePhotos} 张`
      : '图片识别 · 等待图片',
    resourceMonitor: snapshot
      ? `计算机资源 · CPU ${cpuPercent}% · 内存 ${memoryPercent}%`
      : '计算机资源',
  };

  const badges: Record<WorkbenchModuleId, string | undefined> = {
    taskPanel:
      taskCounts && taskCounts.pending > 0 ? String(taskCounts.pending) : undefined,
    imageRecognition: pendingPhotos > 0 ? String(pendingPhotos) : undefined,
    resourceMonitor: cpuPercent === null ? undefined : `${cpuPercent}%`,
  };

  const tones: Record<WorkbenchModuleId, string | undefined> = {
    taskPanel: undefined,
    imageRecognition: undefined,
    resourceMonitor:
      cpuPercent === null || cpuPercent < 65
        ? undefined
        : cpuPercent >= 85
          ? 'danger'
          : 'warning',
  };

  return (
    <div className={styles.workbenchRail} aria-label="育种台模块">
      {order.map((moduleId) => (
        <Hint
          key={moduleId}
          label={hints[moduleId]}
          enabled
          side={side === 'left' ? 'right' : 'left'}
        >
          <button
            type="button"
            aria-label={WORKBENCH_MODULE_META[moduleId].label}
            data-active={activeModule === moduleId ? 'true' : undefined}
            onClick={() => onOpenModule(moduleId)}
          >
            {WORKBENCH_MODULE_META[moduleId].icon}
            {badges[moduleId] && (
              <span className={styles.workbenchRailBadge} data-tone={tones[moduleId]}>
                {badges[moduleId]}
              </span>
            )}
          </button>
        </Hint>
      ))}
    </div>
  );
}

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
  taskCounts,
}: {
  children: ReactNode;
  workbench: ReactNode | WorkbenchRenderer;
  workbenchOpen: boolean;
  onToggleWorkbench: () => void;
  projects: Project[];
  projectId?: string;
  busy: boolean;
  onNewConversation: () => void;
  onSwitchProject: (id: string) => void;
  onOpenYoloResults: (photoId?: string) => void;
  yoloTask: YoloTask;
  taskCounts?: { pending: number; total: number };
}) {
  const [layout, setLayout] = useState<PanelLayout>(readPanelLayout);
  const leftPanel: PanelId = layout.reversed ? 'workbench' : 'navigation';
  const rightPanel: PanelId = leftPanel === 'navigation' ? 'workbench' : 'navigation';
  const nativeWindow = isTauri();
  const mac = /Mac/i.test(navigator.platform);
  // Windows 走自绘标题栏（tauri.windows.conf.json 关闭 decorations），需要自己提供窗口按钮。
  const customTitlebar = nativeWindow && /Win/i.test(navigator.platform);
  const [navigationOpen, setNavigationOpen] = useState(true);
  const [narrow, setNarrow] = useState(
    () => window.matchMedia(COMPACT_LAYOUT_QUERY).matches,
  );
  const [mobilePanel, setMobilePanel] = useState<PanelId | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [compactModule, setCompactModule] = useState<WorkbenchModuleId | null>(null);
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
  const runWindowCommand = (command: 'minimize' | 'toggleMaximize' | 'close') => {
    try {
      const appWindow = getCurrentWindow();
      const action =
        command === 'minimize'
          ? appWindow.minimize()
          : command === 'toggleMaximize'
            ? appWindow.toggleMaximize()
            : appWindow.close();
      // 权限缺失或环境不支持时不再静默：界面提示 + 控制台线索。
      void action.catch((error: unknown) => {
        console.warn(`窗口命令 ${command} 失败`, error);
        toast.error(`窗口操作失败：${String(error)}`);
      });
    } catch (error) {
      console.warn('窗口命令不可用', error);
      toast.error(`窗口操作不可用：${String(error)}`);
    }
  };
  const addWorkbenchModule = (moduleId: AddableWorkbenchModuleId) => {
    const visibilityKey =
      moduleId === 'imageRecognition'
        ? 'showImageRecognition'
        : 'showResourceMonitor';
    setLayout((current) => {
      if (current[visibilityKey]) return current;
      const next = { ...current, [visibilityKey]: true };
      persistPanelLayout(next);
      return next;
    });
  };
  const closeWorkbenchModule = (moduleId: AddableWorkbenchModuleId) => {
    const visibilityKey =
      moduleId === 'imageRecognition'
        ? 'showImageRecognition'
        : 'showResourceMonitor';
    setLayout((current) => {
      if (!current[visibilityKey]) return current;
      const next = { ...current, [visibilityKey]: false };
      persistPanelLayout(next);
      return next;
    });
  };
  const workbenchContent =
    typeof workbench === 'function'
      ? workbench(layout, addWorkbenchModule, closeWorkbenchModule)
      : workbench;
  const moduleTransition = reduced
    ? REDUCED_MOTION_TRANSITION
    : {
        layout: {
          type: 'spring' as const,
          stiffness: 460,
          damping: 38,
          mass: 0.8,
        },
        opacity: {
          duration: 0.14,
          ease: [0.23, 1, 0.32, 1] as const,
        },
        transform: {
          duration: 0.18,
          ease: [0.23, 1, 0.32, 1] as const,
        },
      };
  const renderWorkbenchModule = (moduleId: WorkbenchModuleId) => {
    if (moduleId === 'imageRecognition') {
      if (!layout.showImageRecognition) return null;
      return (
        <motion.div
          key={moduleId}
          layout="position"
          initial={false}
          animate={{ opacity: 1, transform: 'translateY(0)' }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-6px)' }}
          transition={moduleTransition}
          className={styles.moduleSlot}
          data-workbench-module="imageRecognition"
        >
          <YoloTaskCard
            task={yoloTask}
            density={layout.imageRecognitionDensity}
            onOpenResults={onOpenYoloResults}
            onClose={() => closeWorkbenchModule('imageRecognition')}
          />
        </motion.div>
      );
    }
    if (moduleId === 'resourceMonitor') {
      if (!layout.showResourceMonitor) return null;
      return (
        <motion.div
          key={moduleId}
          layout="position"
          initial={false}
          animate={{ opacity: 1, transform: 'translateY(0)' }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-6px)' }}
          transition={moduleTransition}
          className={styles.moduleSlot}
          data-workbench-module="resourceMonitor"
        >
          <SystemResourceCard
            density={layout.resourceMonitorDensity}
            onClose={() => closeWorkbenchModule('resourceMonitor')}
          />
        </motion.div>
      );
    }
    return (
      <motion.div
        key={moduleId}
        layout="position"
        initial={false}
        animate={{ opacity: 1, transform: 'translateY(0)' }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-6px)' }}
        transition={moduleTransition}
        className={`${styles.moduleSlot} ${styles.taskModuleSlot}`}
        data-workbench-module="taskPanel"
      >
        {workbenchContent}
      </motion.div>
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
  // 自绘标题栏的“最大化/还原”图标需要跟随窗口真实状态；非 Tauri 环境没有原生窗口。
  useEffect(() => {
    if (!customTitlebar) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    try {
      const appWindow = getCurrentWindow();
      const syncMaximized = () => {
        void appWindow.isMaximized().then(setMaximized).catch(() => undefined);
      };
      void appWindow
        .onResized(syncMaximized)
        .then((stop) => {
          if (disposed) stop();
          else unlisten = stop;
        })
        .catch(() => undefined);
      syncMaximized();
    } catch {
      // 浏览器调试或单元测试环境没有原生窗口，忽略。
    }
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [customTitlebar]);
  // 侧栏一旦恢复宽度，浮层里的模块会与面板正文重复挂载，直接收起。
  useEffect(() => {
    if (layout.workbench > PANEL_COMPACT_WIDTH) setCompactModule(null);
  }, [layout.workbench]);
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
    const compact = layout[id] <= PANEL_COMPACT_WIDTH;
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
    const conversationLabel = projectId
      ? projects.find((project) => project.id === projectId)?.name || '项目对话'
      : '临时会话';
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
        exit={
          reduced
            ? { opacity: 0, scale: 1, transition: REDUCED_MOTION_TRANSITION }
            : {
                opacity: 0,
                scale: 0.985,
                transition: {
                  opacity: PANEL_EXIT_TRANSITION,
                  scale: PANEL_EXIT_TRANSITION,
                },
              }
        }
        transition={
          reduced || resizing
            ? REDUCED_MOTION_TRANSITION
            : {
                layout: SPRING_LAYOUT,
                opacity: PANEL_ENTER_TRANSITION,
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
        data-panel={id}
        data-side={isLeft ? 'left' : 'right'}
        data-drag-source={dragging === id ? 'true' : undefined}
        data-drag-peer={dragging && dragging !== id ? 'true' : undefined}
        data-compact={compact ? 'true' : undefined}
        aria-label={label}
      >
        <div className={styles.panelHeader}>
          <button
            className={`${styles.grip} ${
              id === 'workbench' ? styles.workbenchGrip : ''
            }`}
            aria-label={`拖动${label}，或用左右方向键换位`}
            title={compact ? `${label} · 拖动到窗口另一侧` : '拖动到窗口另一侧'}
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
              id === 'workbench' ? (
                <Sprout size={16} aria-hidden />
              ) : (
                <GripVertical size={15} />
              )
            ) : id === 'workbench' ? (
              <Sprout size={16} aria-hidden />
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
            <Hint
              label="新的临时会话"
              enabled={compact}
              side={isLeft ? 'right' : 'left'}
            >
              <button
                className={styles.newChat}
                disabled={busy}
                onClick={onNewConversation}
              >
                <Plus size={17} />
                <span>新的临时会话</span>
              </button>
            </Hint>
            <Hint
              label="搜索项目"
              enabled={compact}
              side={isLeft ? 'right' : 'left'}
            >
              <label className={styles.search}>
                <Search size={15} />
                <input
                  aria-label="搜索项目"
                  placeholder="搜索项目…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </Hint>
            <div className={styles.sectionLabel}>当前对话</div>
            <Hint
              label={conversationLabel}
              enabled={compact}
              side={isLeft ? 'right' : 'left'}
            >
              <div className={styles.current}>
                <MessageSquare size={16} />
                <span>{conversationLabel}</span>
                <i />
              </div>
            </Hint>
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
                  <Hint
                    key={project.id}
                    label={project.name}
                    enabled={compact}
                    side={isLeft ? 'right' : 'left'}
                  >
                    <button
                      disabled={busy}
                      aria-current={project.id === projectId ? 'page' : undefined}
                      onClick={() => onSwitchProject(project.id)}
                    >
                      {compact ? (
                        <span className={styles.projectInitial} aria-hidden="true">
                          {project.name.trim().slice(0, 1) || '项'}
                        </span>
                      ) : (
                        <Folder size={16} />
                      )}
                      <span className={styles.projectName}>{project.name}</span>
                    </button>
                  </Hint>
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
              <Hint label="设置" enabled={compact} side={isLeft ? 'right' : 'left'}>
                <button aria-label="打开设置" onClick={() => setSettingsOpen(true)}>
                  <Settings size={16} />
                  <span>设置</span>
                </button>
              </Hint>
              <span>lian / 研究助手</span>
            </div>
          </nav>
        ) : compact ? (
          <WorkbenchRail
            order={layout.workbenchOrder}
            yoloTask={yoloTask}
            taskCounts={taskCounts}
            activeModule={compactModule}
            side={leftPanel === 'workbench' ? 'left' : 'right'}
            onOpenModule={setCompactModule}
          />
        ) : (
          <div className={`${styles.panelBody} ${styles.workbenchBody}`}>
            <div className={styles.workbenchPinned}>
              {renderWorkbenchModule('taskPanel')}
            </div>
            <div className={styles.workbenchModules}>
              <AnimatePresence initial={false} mode="popLayout">
                {layout.workbenchOrder
                  .filter((moduleId) => moduleId !== 'taskPanel')
                  .map(renderWorkbenchModule)}
              </AnimatePresence>
            </div>
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
        data-native-windows={customTitlebar ? 'true' : undefined}
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
        {customTitlebar && (
          <div className={styles.windowControls}>
            <button
              aria-label="最小化"
              title="最小化"
              onClick={() => runWindowCommand('minimize')}
            >
              <Minus size={15} />
            </button>
            <button
              aria-label={maximized ? '向下还原' : '最大化'}
              title={maximized ? '向下还原' : '最大化'}
              onClick={() => runWindowCommand('toggleMaximize')}
            >
              {maximized ? <Copy size={13} /> : <Square size={12} />}
            </button>
            <button
              aria-label="关闭"
              title="关闭"
              className={styles.closeControl}
              onClick={() => runWindowCommand('close')}
            >
              <X size={15} />
            </button>
          </div>
        )}
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
        <LayoutGroup id="agent-shell-panels">
          <AnimatePresence initial={false} mode="popLayout">
            {visible('navigation') && panel('navigation')}
            <motion.div
              key="conversation"
              layout={!resizing}
              className={styles.center}
              style={{ order: 1 }}
              transition={
                reduced || resizing
                  ? REDUCED_MOTION_TRANSITION
                  : { layout: SPRING_LAYOUT }
              }
            >
              {children}
            </motion.div>
            {visible('workbench') && panel('workbench')}
          </AnimatePresence>
        </LayoutGroup>
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
      {compactModule && (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) setCompactModule(null);
          }}
        >
          <SheetContent
            side={leftPanel === 'workbench' ? 'left' : 'right'}
            className="w-[380px] max-w-[88vw] overflow-y-auto"
          >
            <SheetHeader>
              <SheetTitle>{WORKBENCH_MODULE_META[compactModule].label}</SheetTitle>
            </SheetHeader>
            {renderWorkbenchModule(compactModule)}
          </SheetContent>
        </Sheet>
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
