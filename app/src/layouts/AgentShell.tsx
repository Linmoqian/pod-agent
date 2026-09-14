/* 可移动、可调宽的 Agent 对话工作台。
 * Created on 2026-09-14
 * @author: https://github.com/Linmoqian
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeftRight,
  Folder,
  GripVertical,
  MessageSquare,
  PanelLeft,
  PanelRight,
  Plus,
  RotateCcw,
  Search,
  Settings,
  X,
} from 'lucide-react';
import SettingsModal from '../features/settings/components/SettingsModal';
import type { Project } from '../features/workspace/types';
import styles from './AgentShell.module.css';
import YoloTaskCard, { useYoloTask } from '../features/workspace/components/YoloTaskCard';

type PanelId = 'navigation' | 'workbench';
type Layout = { reversed: boolean; navigation: number; workbench: number };
const DEFAULT_LAYOUT: Layout = {
  reversed: false,
  navigation: 248,
  workbench: 320,
};
const STORAGE_KEY = 'lian.chat-layout.v1';
function readLayout(): Layout {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (
      value &&
      typeof value.reversed === 'boolean' &&
      Number.isFinite(value.navigation) &&
      Number.isFinite(value.workbench)
    ) {
      return {
        reversed: value.reversed,
        navigation: Math.min(420, Math.max(220, value.navigation)),
        workbench: Math.min(480, Math.max(280, value.workbench)),
      };
    }
  } catch {
    /* 布局偏好不可读时使用默认值。 */
  }
  return DEFAULT_LAYOUT;
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
}: {
  children: ReactNode;
  workbench: ReactNode;
  workbenchOpen: boolean;
  onToggleWorkbench: () => void;
  projects: Project[];
  projectId?: string;
  busy: boolean;
  onNewConversation: () => void;
  onSwitchProject: (id: string) => void;
}) {
  const [layout, setLayout] = useState(readLayout);
  const yoloTask = useYoloTask();
  const [navigationOpen, setNavigationOpen] = useState(true);
  const [narrow, setNarrow] = useState(
    () => window.matchMedia('(max-width: 820px)').matches,
  );
  const [mobilePanel, setMobilePanel] = useState<PanelId | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState<PanelId | null>(null);
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
  const reduced = useReducedMotion();
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
  useEffect(() => {
    const media = window.matchMedia('(max-width: 820px)');
    const update = () => {
      setNarrow(media.matches);
      setMobilePanel(null);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      /* 内存布局仍可使用。 */
    }
  }, [layout]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        if (narrow) {
          const target = event.shiftKey ? 'workbench' : 'navigation';
          setMobilePanel((value) => (value === target ? null : target));
          if (target === 'workbench' && !workbenchOpen) onToggleWorkbench();
        } else if (event.shiftKey) onToggleWorkbench();
        else setNavigationOpen((value) => !value);
      }
      if (event.key === 'Escape') {
        gesture.current = null;
        setDragging(null);
        setTargetSide(null);
        setMobilePanel(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onToggleWorkbench, narrow, workbenchOpen]);
  const leftPanel: PanelId = layout.reversed ? 'workbench' : 'navigation';
  const swap = () =>
    setLayout((value) => ({ ...value, reversed: !value.reversed }));
  const panel = (id: PanelId) => {
    const isLeft = id === leftPanel;
    const label = id === 'navigation' ? '会话侧栏' : '育种台';
    const close = () =>
      narrow
        ? setMobilePanel(null)
        : id === 'navigation'
          ? setNavigationOpen(false)
          : onToggleWorkbench();
    const begin = (event: React.PointerEvent<HTMLElement>, resize: boolean) => {
      if (!event.isPrimary || event.button !== 0 || gesture.current) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = {
        id: event.pointerId,
        x: event.clientX,
        panel: id,
        width: layout[id],
        resize,
      };
      if (!resize) setDragging(id);
    };
    const move = (event: React.PointerEvent<HTMLElement>) => {
      const active = gesture.current;
      if (!active || active.id !== event.pointerId) return;
      if (active.resize) {
        const min = id === 'navigation' ? 220 : 280;
        const max = id === 'navigation' ? 420 : 480;
        const width = Math.min(
          max,
          Math.max(
            min,
            active.width + (event.clientX - active.x) * (isLeft ? 1 : -1),
          ),
        );
        setLayout((value) => ({ ...value, [id]: width }));
      } else {
        const bounds = root.current?.getBoundingClientRect();
        if (bounds)
          setTargetSide(
            event.clientX < bounds.left + bounds.width / 2 ? 'left' : 'right',
          );
      }
    };
    const finish = (event: React.PointerEvent<HTMLElement>) => {
      const active = gesture.current;
      if (!active || active.id !== event.pointerId) return;
      if (
        !active.resize &&
        Math.abs(event.clientX - active.x) > 20 &&
        targetSide &&
        (targetSide === 'left') !== isLeft
      )
        swap();
      gesture.current = null;
      setDragging(null);
      setTargetSide(null);
    };
    const cancel = () => {
      gesture.current = null;
      setDragging(null);
      setTargetSide(null);
    };
    return (
      <motion.aside
        key={id}
        layout="position"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduced ? 0 : 0.18 }}
        className={styles.panel}
        style={{ width: layout[id], order: isLeft ? 0 : 2 }}
        data-side={isLeft ? 'left' : 'right'}
        aria-label={label}
      >
        <div className={styles.panelHeader}>
          <button
            className={styles.grip}
            aria-label={`拖动${label}，或用左右方向键换位`}
            title="拖动到窗口另一侧"
            onPointerDown={(event) => begin(event, false)}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={cancel}
            onLostPointerCapture={cancel}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                if ((event.key === 'ArrowLeft') !== isLeft) swap();
              }
            }}
          >
            <GripVertical size={14} />
            <span>{id === 'navigation' ? '工作空间' : '研究上下文'}</span>
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
              新的临时会话
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
              <YoloTaskCard task={yoloTask} />
              <button onClick={() => setSettingsOpen(true)}>
                <Settings size={16} />
                设置
              </button>
              <span>lian / 研究助手</span>
            </div>
          </nav>
        ) : (
          <div className={styles.panelBody}>{workbench}</div>
        )}
        <div
          className={styles.resize}
          role="separator"
          tabIndex={0}
          aria-label={`调整${label}宽度`}
          aria-orientation="vertical"
          aria-valuenow={layout[id]}
          aria-valuemin={id === 'navigation' ? 220 : 280}
          aria-valuemax={id === 'navigation' ? 420 : 480}
          onPointerDown={(event) => begin(event, true)}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={cancel}
          onLostPointerCapture={cancel}
          onDoubleClick={() =>
            setLayout((value) => ({ ...value, [id]: DEFAULT_LAYOUT[id] }))
          }
          onKeyDown={(event) => {
            if (
              ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
            ) {
              event.preventDefault();
              const min = id === 'navigation' ? 220 : 280;
              const max = id === 'navigation' ? 420 : 480;
              setLayout((value) => ({
                ...value,
                [id]:
                  event.key === 'Home'
                    ? min
                    : event.key === 'End'
                      ? max
                      : Math.max(
                          min,
                          Math.min(
                            max,
                            value[id] +
                              (event.key === 'ArrowRight' ? 16 : -16) *
                                (isLeft ? 1 : -1),
                          ),
                        ),
              }));
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
  return (
    <div className={styles.shell} ref={root} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 230), y: Math.min(event.clientY, window.innerHeight - 190) }); }}>
      <header className={styles.titlebar}>
        <span className={styles.wordmark}>
          lian<span> / </span>
          <small>研究工作空间</small>
        </span>
        <div>
          <button
            aria-label={visible('navigation') ? '切换会话侧栏' : '展开会话侧栏'}
            title="会话侧栏 · ⌘B"
            onClick={toggleNavigation}
          >
            <PanelLeft size={17} />
          </button>
          <button
            aria-label={visible('workbench') ? '切换育种台' : '展开育种台'}
            title="研究上下文 · ⌘⇧B"
            onClick={toggleWorkbench}
          >
            <PanelRight size={17} />
          </button>
          <button
            aria-label="重置布局"
            title="恢复默认布局"
            onClick={() => {
              setLayout(DEFAULT_LAYOUT);
              setNavigationOpen(true);
              setMobilePanel(null);
              if (!workbenchOpen) onToggleWorkbench();
            }}
          >
            <RotateCcw size={15} />
          </button>
          <button aria-label="打开设置" onClick={() => setSettingsOpen(true)}>
            <Settings size={16} />
          </button>
        </div>
      </header>
      <div className={styles.body}>
        <AnimatePresence initial={false}>
          {visible('navigation') && panel('navigation')}
          <motion.div
            key="conversation"
            className={styles.center}
            style={{ order: 1 }}
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
        >
          释放以停靠到{targetSide === 'right' ? '右' : '左'}侧
        </div>
      )}
      {contextMenu && (
        <motion.menu className={styles.contextMenu} style={{ left: contextMenu.x, top: contextMenu.y }} initial={{ opacity: 0, scale: 0.96, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} role="menu">
          <li><button role="menuitem" onClick={() => { onNewConversation(); setContextMenu(null); }}><Plus size={15} />新的临时会话 <kbd>⌘N</kbd></button></li>
          <li><button role="menuitem" onClick={() => { toggleNavigation(); setContextMenu(null); }}><PanelLeft size={15} />切换会话侧栏</button></li>
          <li><button role="menuitem" onClick={() => { toggleWorkbench(); setContextMenu(null); }}><PanelRight size={15} />切换研究上下文</button></li>
          <li className={styles.menuDivider} />
          <li><button role="menuitem" onClick={() => { setLayout(DEFAULT_LAYOUT); setContextMenu(null); }}><RotateCcw size={15} />恢复默认布局</button></li>
      </motion.menu>
      )}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
