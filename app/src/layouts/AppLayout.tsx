/*
 * lian@育种台会话优先布局：lian 永远可聊，数据让它可做，项目让它可持续。
 * Created on 2026-09-12
 * Updated on 2026-09-14
 * @author: https://github.com/Linmoqian
 */

import {
  ChevronRight,
  Circle,
  Copy,
  FileCode2,
  FileText,
  FolderOpen,
  Images,
  MessageSquare,
  Pencil,
  Plus,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  useCallback,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import WorkbenchPanel from '../features/workspace/components/WorkbenchPanel';
import WorkspaceComposer from '../features/workspace/components/WorkspaceComposer';
import WorkspaceTimeline from '../features/workspace/components/WorkspaceTimeline';
import WorkspaceFilePreviewPanel from '../features/workspace/components/WorkspaceFilePreview';
import YoloResultsPanel from '../features/workspace/components/YoloResultsDialog';
import TerminalPanel from '../features/workspace/components/TerminalPanel';
import { useYoloTask } from '../features/workspace/components/YoloTaskCard';
import { getFilePreviewKind } from '../features/workspace/components/WorkbenchFileTreeIcons';
import { createWorkbenchTasks } from '../features/workspace/workbenchTasks';
import { workspaceApi } from '../services/workspace';
import type {
  WorkspaceFileNode,
  WorkspaceFilePreview,
} from '../features/workspace/types';
import useWorkspaceController, {
  type WorkspaceTab,
} from '../features/workspace/hooks/useWorkspaceController';
import AgentShell from './AgentShell';
import styles from './AppLayout.module.css';
import useWorkspaceTabLayout, {
  type WorkspaceTabGroup,
  type WorkspaceTabGroupColor,
  WORKSPACE_TAB_GROUP_COLORS,
} from './useWorkspaceTabLayout';
import { useSettings } from '../features/settings/context';

type ContextHeaderProps = {
  activeView: 'conversation' | 'yolo-results' | 'file-preview' | 'terminal';
  tabs: WorkspaceTab[];
  tabGroups: WorkspaceTabGroup[];
  activeTabId: string;
  busy: boolean;
  onActivateTab: (tabId: string) => void;
  onMoveTabBefore: (sourceId: string, targetId: string) => void;
  onGroupTabWith: (sourceId: string, targetId: string) => void;
  onMoveTabToGroup: (tabId: string, groupId: string) => void;
  onUngroupTab: (tabId: string) => void;
  onSetTabGroup: (tabId: string, groupId: string | null) => void;
  onCloseTab: (tabId: string) => void;
  onCopyConversation: (conversationId: string) => Promise<void>;
  onRenameTab: (tabId: string, name: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onSetGroupColor: (groupId: string, color: WorkspaceTabGroupColor) => void;
  onUngroupGroup: (groupId: string) => void;
  contextLabel: string;
  inProject: boolean;
  projects: { id: string; name: string; status: string }[];
  datasetCount: number;
  artifactCount: number;
  materialCount: number;
  onSwitchProject: (projectId: string) => void;
  onCreateProject: (name: string) => void;
  onArchiveProject: () => void;
  onStartNewConversation: () => void;
  onStartNewConversationInGroup: (groupId: string) => Promise<void>;
  onPromoteConversation: (conversationId: string, name: string) => Promise<boolean>;
  yoloResultsOpen: boolean;
  onOpenYoloResults: (photoId?: string) => void;
  onCloseYoloResults: () => void;
  filePreview: WorkspaceFilePreview | null;
  onOpenFilePreview: () => void;
  onCloseFilePreview: () => void;
  developerMode: boolean;
  terminalOpen: boolean;
  onOpenTerminal: () => void;
  onCloseTerminal: () => void;
};

type FilePreviewState = WorkspaceFilePreview & {
  status: 'loading' | 'ready' | 'error';
  error?: string;
};

type DragPreviewState = {
  tabId: string;
  x: number;
  y: number;
  width: number;
};

function LoadingShell() {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={styles.loading}
      role="status"
      animate={reduced ? undefined : { opacity: [0.62, 1, 0.62] }}
      transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
    >
      <div className={styles.loadingHeader}><span /><i /><i /></div>
      <div className={styles.loadingMessages}><span /><span /><span /><span /></div>
      <div className={styles.loadingComposer}><span /><b /></div>
      <strong>正在连接 lian</strong>
    </motion.div>
  );
}

function clearTextSelection() {
  window.getSelection()?.removeAllRanges();
}

function ContextHeader(props: ContextHeaderProps) {
  const reduced = useReducedMotion();
  const [naming, setNaming] = useState<
    'create' | 'save' | 'rename-group' | null
  >(null);
  const [name, setName] = useState('');
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState('');
  const editingTabInputRef = useRef<HTMLInputElement>(null);
  const renameFinishRef = useRef<'pending' | 'committed' | 'cancelled'>('pending');
  const [renamingGroup, setRenamingGroup] = useState<WorkspaceTabGroup | null>(null);
  const [closingTab, setClosingTab] = useState<WorkspaceTab | null>(null);
  const [saveAndCloseTab, setSaveAndCloseTab] = useState<WorkspaceTab | null>(null);
  const [contextTab, setContextTab] = useState<WorkspaceTab | null>(null);
  const [contextGroup, setContextGroup] = useState<WorkspaceTabGroup | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    tabId: string;
    mode: 'group' | 'reorder';
  } | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const pointerDragRef = useRef<{
    tabId: string;
    startX: number;
    startY: number;
    active: boolean;
    pointerId: number;
    element: HTMLDivElement;
    offsetX: number;
    offsetY: number;
    width: number;
  } | null>(null);
  const draggingTabIdRef = useRef<string | null>(null);
  const dropTargetRef = useRef<typeof dropTarget>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const suppressNextClickRef = useRef(false);
  const busyRef = useRef(props.busy);
  const propsRef = useRef(props);
  const tabGroups = useMemo(() => props.tabGroups ?? [], [props.tabGroups]);
  busyRef.current = props.busy;
  propsRef.current = props;
  const lastTemporaryTabIndex = props.tabs.reduce(
    (lastIndex, tab, index) => (tab.projectId ? lastIndex : index),
    -1,
  );
  const lastTemporaryTabId = props.tabs[lastTemporaryTabIndex]?.id;
  const groupByTab = useMemo(
    () =>
      new Map(
        tabGroups.flatMap((group) =>
          group.tabIds.map((tabId) => [tabId, group.id] as const),
        ),
      ),
    [tabGroups],
  );
  const tabBlocks = useMemo(() => {
    const groupsById = new Map(tabGroups.map((group) => [group.id, group]));
    const seenGroups = new Set<string>();
    return props.tabs.reduce<
      Array<{ group: WorkspaceTabGroup | null; tabs: WorkspaceTab[] }>
    >((blocks, tab) => {
      const groupId = groupByTab.get(tab.id);
      if (!groupId) {
        blocks.push({ group: null, tabs: [tab] });
      } else if (!seenGroups.has(groupId)) {
        const group = groupsById.get(groupId);
        if (!group) return blocks;
        seenGroups.add(groupId);
        blocks.push({
          group,
          tabs: props.tabs.filter((item) => groupByTab.get(item.id) === groupId),
        });
      }
      return blocks;
    }, []);
  }, [groupByTab, tabGroups, props.tabs]);
  const createProject = () => {
    setName('');
    setNaming('create');
  };
  const requestCloseTab = (tab: WorkspaceTab) => {
    if (tab.projectId) {
      props.onCloseTab(tab.id);
      return;
    }
    setClosingTab(tab);
  };
  const closeContextMenu = () => {
    setContextTab(null);
    setContextGroup(null);
    setContextMenuPosition(null);
    setGroupMenuOpen(false);
  };
  const startTabRename = () => {
    if (!contextTab) return;
    renameFinishRef.current = 'pending';
    setEditingTabId(contextTab.id);
    setEditingTabName(contextTab.label);
    closeContextMenu();
  };
  const commitTabRename = () => {
    if (renameFinishRef.current !== 'pending') return;
    renameFinishRef.current = 'committed';
    const trimmed = editingTabName.trim();
    if (editingTabId && trimmed) props.onRenameTab(editingTabId, trimmed);
    setEditingTabId(null);
  };
  const cancelTabRename = () => {
    renameFinishRef.current = 'cancelled';
    setEditingTabId(null);
  };
  const commitGroupName = () => {
    const trimmed = groupNameDraft.trim();
    if (!contextGroup || !trimmed) return;
    props.onRenameGroup(contextGroup.id, trimmed);
    setContextGroup((current) =>
      current ? { ...current, name: trimmed } : current,
    );
  };
  const openGroupRenameDialog = () => {
    if (!contextGroup) return;
    setRenamingGroup(contextGroup);
    setName(contextGroup.name);
    setNaming('rename-group');
    closeContextMenu();
  };

  const clearDragState = useCallback(() => {
    const drag = pointerDragRef.current;
    if (drag) {
      try {
        if (drag.element.hasPointerCapture(drag.pointerId)) {
          drag.element.releasePointerCapture(drag.pointerId);
        }
      } catch {
        // 指针已取消时，释放捕获可能抛错，不影响清理拖拽状态。
      }
    }
    pointerDragRef.current = null;
    draggingTabIdRef.current = null;
    dropTargetRef.current = null;
    setDraggingTabId(null);
    setDragPreview(null);
    setDropTarget(null);
    setDragOverGroupId(null);
  }, []);
  const setCurrentDropTarget = useCallback((next: typeof dropTarget) => {
    dropTargetRef.current = next;
    setDropTarget(next);
  }, []);
  const getDropMode = useCallback((element: HTMLElement, clientX: number) => {
    const rect = element.getBoundingClientRect();
    const offset = clientX - rect.left;
    return offset < rect.width * 0.28 || offset > rect.width * 0.72
      ? 'reorder'
      : 'group';
  }, []);
  const handlePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    tabId: string,
  ) => {
    if (props.busy || event.button !== 0) return;
    if (
      event.target instanceof Element &&
      event.target.closest(`.${styles.closeTab}, input, textarea, select, [contenteditable]`)
    ) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    pointerDragRef.current = {
      tabId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      pointerId: event.pointerId,
      element: event.currentTarget,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
    };
  };

  useEffect(() => {
    const updateDropTarget = (clientX: number, clientY: number) => {
      const element = document.elementFromPoint(clientX, clientY);
      const tabElement = element?.closest<HTMLElement>('[data-workspace-tab-id]');
      if (tabElement) {
        const targetId = tabElement.dataset.workspaceTabId;
        if (
          targetId &&
          targetId !== draggingTabIdRef.current
        ) {
          setCurrentDropTarget({
            tabId: targetId,
            mode: getDropMode(tabElement, clientX),
          });
          setDragOverGroupId(null);
          return;
        }
      }
      const groupElement = element?.closest<HTMLElement>('[data-workspace-tab-group]');
      if (groupElement?.dataset.workspaceTabGroup) {
        setCurrentDropTarget(null);
        setDragOverGroupId(groupElement.dataset.workspaceTabGroup);
        return;
      }
      setCurrentDropTarget(null);
      setDragOverGroupId(null);
    };

    const move = (event: globalThis.PointerEvent) => {
      const drag = pointerDragRef.current;
      if (!drag || busyRef.current) return;
      const distance = Math.hypot(
        event.clientX - drag.startX,
        event.clientY - drag.startY,
      );
      if (!drag.active && distance < 6) return;
      if (!drag.active) {
        drag.active = true;
        draggingTabIdRef.current = drag.tabId;
        setDraggingTabId(drag.tabId);
        try {
          drag.element.setPointerCapture(drag.pointerId);
        } catch {
          // 某些浏览器在指针已离开窗口时无法捕获，仍继续使用全局监听。
        }
      }
      event.preventDefault();
      const x = event.clientX - drag.offsetX;
      const y = event.clientY - drag.offsetY;
      setDragPreview((current) =>
        current && current.tabId === drag.tabId
          ? { ...current, x, y }
          : {
              tabId: drag.tabId,
              x,
              y,
              width: drag.width,
            },
      );
      updateDropTarget(event.clientX, event.clientY);
    };

    const finish = (event: globalThis.PointerEvent) => {
      const drag = pointerDragRef.current;
      if (!drag) return;
      if (!drag.active || busyRef.current) {
        clearDragState();
        return;
      }
      const sourceId = drag.tabId;
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const targetId = element?.closest<HTMLElement>('[data-workspace-tab-id]')
        ?.dataset.workspaceTabId;
      const actions = propsRef.current;
      if (targetId && targetId !== sourceId) {
        const mode =
          dropTargetRef.current?.tabId === targetId
            ? dropTargetRef.current.mode
            : 'group';
        if (mode === 'group') {
          actions.onGroupTabWith(sourceId, targetId);
        } else {
          actions.onMoveTabBefore(sourceId, targetId);
          const targetGroupId = groupByTab.get(targetId);
          if (targetGroupId) actions.onMoveTabToGroup(sourceId, targetGroupId);
          else actions.onUngroupTab(sourceId);
        }
      } else {
        const groupId = element?.closest<HTMLElement>('[data-workspace-tab-group]')
          ?.dataset.workspaceTabGroup;
        if (groupId) actions.onMoveTabToGroup(sourceId, groupId);
        else if (tabListRef.current?.contains(element)) actions.onUngroupTab(sourceId);
      }
      suppressNextClickRef.current = true;
      clearDragState();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [clearDragState, getDropMode, groupByTab, setCurrentDropTarget]);

  useEffect(() => {
    const save = (event: KeyboardEvent) => {
      if (
        props.inProject ||
        event.key.toLowerCase() !== 's' ||
        (!event.ctrlKey && !event.metaKey)
      ) {
        return;
      }
      event.preventDefault();
      setName('');
      setSaveAndCloseTab(null);
      setNaming('save');
    };
    window.addEventListener('keydown', save);
    return () => window.removeEventListener('keydown', save);
  }, [props.inProject]);

  useEffect(() => {
    if (!contextMenuPosition) return;
    const close = (event: globalThis.PointerEvent) => {
      if (!contextMenuRef.current?.contains(event.target as Node)) {
        closeContextMenu();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeContextMenu();
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', escape);
    };
  }, [contextMenuPosition]);

  useEffect(() => {
    if (!editingTabId) return;
    editingTabInputRef.current?.focus();
    editingTabInputRef.current?.select();
  }, [editingTabId]);

  const newConversationButton = (
    <motion.div
      layout="position"
      className={styles.newTabSlot}
      transition={{ type: 'spring', stiffness: 460, damping: 36, mass: 0.7 }}
    >
      <Button
        variant="ghost"
        size="icon"
        className={styles.newTab}
        aria-label="新建临时会话"
        title="新建临时会话"
        disabled={props.busy}
        onClick={props.onStartNewConversation}
      >
        <Plus size={17} strokeWidth={1.75} />
      </Button>
    </motion.div>
  );

  const renderTab = (tab: WorkspaceTab) => {
    const active = props.activeView === 'conversation' && tab.id === props.activeTabId;
    const target = dropTarget?.tabId === tab.id ? dropTarget.mode : undefined;
    const editing = editingTabId === tab.id;
    return (
      <motion.div
        key={tab.id}
        layout="position"
        className={styles.tab}
        data-workspace-tab-id={tab.id}
        data-active={active ? 'true' : undefined}
        data-editing={editing ? 'true' : undefined}
        data-dragging={draggingTabId === tab.id ? 'true' : undefined}
        data-drop-mode={target}
        onPointerDownCapture={(event) => handlePointerDown(event, tab.id)}
        onContextMenu={(event) => {
          if (event.target instanceof Element && event.target.closest('input')) return;
          event.preventDefault();
          event.stopPropagation();
          clearTextSelection();
          setContextTab(tab);
          setGroupMenuOpen(false);
          setContextMenuPosition({
            x: Math.max(8, Math.min(event.clientX, window.innerWidth - 224)),
            y: Math.max(8, Math.min(event.clientY, window.innerHeight - 260)),
          });
        }}
        transition={{ type: 'spring', stiffness: 460, damping: 36, mass: 0.7 }}
      >
        {editing ? (
          <div className={styles.tabEditLabel}>
            {!tab.projectId && <MessageSquare size={13} strokeWidth={1.8} aria-hidden />}
            <input
              ref={editingTabInputRef}
              className={styles.tabRenameInput}
              aria-label="选项卡名称"
              value={editingTabName}
              maxLength={120}
              disabled={props.busy}
              onChange={(event) => setEditingTabName(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitTabRename();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelTabRename();
                }
              }}
              onBlur={commitTabRename}
            />
          </div>
        ) : (
          <button
            type="button"
            role="tab"
            aria-selected={active}
            className={`${styles.tabLabel} ${!tab.projectId ? styles.temporaryTabLabel : ''}`}
            disabled={props.busy}
            onClick={() => {
              if (suppressNextClickRef.current) {
                suppressNextClickRef.current = false;
                return;
              }
              props.onActivateTab(tab.id);
            }}
          >
            {!tab.projectId && <MessageSquare size={13} strokeWidth={1.8} aria-hidden />}
            <span>{tab.label}</span>
          </button>
        )}
        <button
          type="button"
          className={styles.closeTab}
          aria-label={`关闭${tab.label}`}
          disabled={props.busy}
          onClick={() => requestCloseTab(tab)}
        >
          <X size={14} />
        </button>
      </motion.div>
    );
  };

  const renderDragPreview = () => {
    if (!dragPreview) return null;
    const tab = props.tabs.find((item) => item.id === dragPreview.tabId);
    if (!tab) return null;
    const active = props.activeView === 'conversation' && tab.id === props.activeTabId;
    return (
      <div
        className={styles.dragPreviewLayer}
        style={{
          width: dragPreview.width,
          transform: `translate3d(${dragPreview.x}px, ${dragPreview.y}px, 0)`,
        }}
        aria-hidden="true"
      >
        <motion.div
          className={`${styles.tab} ${styles.dragPreview}`}
          data-active={active ? 'true' : undefined}
          initial={reduced ? false : { opacity: 0, transform: 'scale(0.98)' }}
          animate={{
            opacity: 1,
            transform: reduced ? 'scale(1)' : 'scale(1.04) rotate(1deg)',
          }}
          transition={reduced
            ? { duration: 0 }
            : { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }}
        >
          <span
            className={`${styles.tabLabel} ${!tab.projectId ? styles.temporaryTabLabel : ''}`}
          >
            {!tab.projectId && <MessageSquare size={13} strokeWidth={1.8} aria-hidden />}
            <span>{tab.label}</span>
          </span>
          <span className={styles.closeTab} aria-hidden>
            <X size={14} />
          </span>
        </motion.div>
      </div>
    );
  };

  return (
    <header className={styles.header}>
      <div
        ref={tabListRef}
        className={styles.tabList}
        role="tablist"
        aria-label="已打开的会话和工作区视图"
      >
        {tabBlocks.map((block) => {
          const group = block.group;
          const blockContent = group ? (
            <div
              key={`group:${group.id}`}
              className={styles.tabGroup}
              data-workspace-tab-group={group.id}
              data-color={group.color}
              data-drag-over={
                dragOverGroupId === group.id
                  ? 'true'
                  : undefined
              }
            >
              <button
                type="button"
                className={styles.tabGroupLabel}
                aria-label={`分组：${group.name}，右键打开分组菜单`}
                title="右键打开分组菜单"
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  clearTextSelection();
                  setContextTab(null);
                  setContextGroup(group);
                  setGroupNameDraft(group.name);
                  setGroupMenuOpen(false);
                  setContextMenuPosition({
                    x: Math.max(8, Math.min(event.clientX, window.innerWidth - 264)),
                    y: Math.max(8, Math.min(event.clientY, window.innerHeight - 360)),
                  });
                }}
              >
                <span
                  className={styles.tabGroupColor}
                  data-color={group.color}
                  aria-hidden
                />
                <span>{group.name}</span>
              </button>
              <div className={styles.tabGroupTabs}>
                {block.tabs.map(renderTab)}
              </div>
            </div>
          ) : (
            <Fragment key={block.tabs[0].id}>{renderTab(block.tabs[0])}</Fragment>
          );
          const hasLastTemporaryTab = block.tabs.some(
            (tab) => tab.id === lastTemporaryTabId,
          );
          return (
            <Fragment key={block.group?.id ?? block.tabs[0].id}>
              {blockContent}
              {hasLastTemporaryTab && newConversationButton}
            </Fragment>
          );
        })}
        {props.yoloResultsOpen && (
          <motion.div
            layout="position"
            className={`${styles.tab} ${styles.utilityTab}`}
            data-active={props.activeView === 'yolo-results' ? 'true' : undefined}
            transition={{ type: 'spring', stiffness: 460, damping: 36, mass: 0.7 }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={props.activeView === 'yolo-results'}
              className={styles.tabLabel}
              onClick={() => props.onOpenYoloResults()}
            >
              <Images size={14} aria-hidden />
              <span>图片识别结果</span>
            </button>
            <button
              type="button"
              className={styles.closeTab}
              aria-label="关闭图片识别结果"
              disabled={props.busy}
              onClick={props.onCloseYoloResults}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
        {props.filePreview && (
          <motion.div
            layout="position"
            className={`${styles.tab} ${styles.utilityTab}`}
            data-active={
              props.activeView === 'file-preview' ? 'true' : undefined
            }
            transition={{
              type: 'spring',
              stiffness: 460,
              damping: 36,
              mass: 0.7,
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={props.activeView === 'file-preview'}
              className={styles.tabLabel}
              onClick={props.onOpenFilePreview}
            >
              {props.filePreview.kind === 'markdown' ? (
                <FileText size={14} aria-hidden />
              ) : (
                <FileCode2 size={14} aria-hidden />
              )}
              <span>{props.filePreview.name}</span>
            </button>
            <button
              type="button"
              className={styles.closeTab}
              aria-label={`关闭文件${props.filePreview.name}`}
              onClick={props.onCloseFilePreview}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
        {props.terminalOpen && (
          <motion.div
            layout="position"
            className={`${styles.tab} ${styles.utilityTab}`}
            data-active={props.activeView === 'terminal' ? 'true' : undefined}
            transition={{
              type: 'spring',
              stiffness: 460,
              damping: 36,
              mass: 0.7,
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={props.activeView === 'terminal'}
              className={styles.tabLabel}
              onClick={props.onOpenTerminal}
            >
              <Terminal size={14} aria-hidden />
              <span>终端</span>
            </button>
            <button
              type="button"
              className={styles.closeTab}
              aria-label="关闭终端"
              onClick={props.onCloseTerminal}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
        {(!lastTemporaryTabId || !tabBlocks.some((block) =>
          block.tabs.some((tab) => tab.id === lastTemporaryTabId),
        )) && newConversationButton}
      </div>
      {renderDragPreview()}
      {contextTab && contextMenuPosition && (
        <div
          ref={contextMenuRef}
          className={styles.tabContextMenu}
          role="menu"
          aria-label={`${contextTab.label}的选项`}
          style={{
            left: contextMenuPosition.x,
            top: contextMenuPosition.y,
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            role="menuitem"
            className={styles.tabContextMenuItem}
            disabled={props.busy}
            onClick={() => {
              void props.onCopyConversation(contextTab.id);
              closeContextMenu();
            }}
          >
            <Copy size={15} aria-hidden />
            <span>复制对话</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.tabContextMenuItem}
            disabled={props.busy}
            onClick={startTabRename}
          >
            <Pencil size={15} aria-hidden />
            <span>重命名</span>
          </button>
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={groupMenuOpen}
            className={styles.tabContextMenuItem}
            disabled={props.busy}
            onClick={() => setGroupMenuOpen((open) => !open)}
          >
            <FolderOpen size={15} aria-hidden />
            <span>设置分组</span>
            <ChevronRight size={14} className={styles.tabContextMenuArrow} aria-hidden />
          </button>
          {groupMenuOpen && (
            <div className={styles.tabContextGroupList} role="menu" aria-label="选择分组">
              <button
                type="button"
                role="menuitem"
                className={styles.tabContextGroupOption}
                disabled={!groupByTab.has(contextTab.id)}
                onClick={() => {
                  props.onSetTabGroup(contextTab.id, null);
                  closeContextMenu();
                }}
              >
                未分组
              </button>
              {tabGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  role="menuitem"
                  className={styles.tabContextGroupOption}
                  disabled={groupByTab.get(contextTab.id) === group.id}
                  onClick={() => {
                    props.onSetTabGroup(contextTab.id, group.id);
                    closeContextMenu();
                  }}
                >
                  {group.name}
                </button>
              ))}
              {!tabGroups.length && (
                <span className={styles.tabContextMenuHint}>拖动标签到一起新建分组</span>
              )}
            </div>
          )}
          <div className={styles.tabContextMenuSeparator} />
          <button
            type="button"
            role="menuitem"
            className={styles.tabContextMenuItem}
            disabled={props.busy}
            onClick={() => {
              closeContextMenu();
              requestCloseTab(contextTab);
            }}
          >
            <X size={15} aria-hidden />
            <span>关闭对话</span>
          </button>
        </div>
      )}
      {contextGroup && contextMenuPosition && !contextTab && (
        <div
          ref={contextMenuRef}
          className={`${styles.tabContextMenu} ${styles.tabGroupContextMenu}`}
          role="menu"
          aria-label={`${contextGroup.name}分组的选项`}
          style={{
            left: contextMenuPosition.x,
            top: contextMenuPosition.y,
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <input
            className={styles.tabGroupNameInput}
            aria-label="分组名称"
            value={groupNameDraft}
            maxLength={80}
            autoFocus
            onChange={(event) => setGroupNameDraft(event.target.value)}
            onBlur={commitGroupName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitGroupName();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                closeContextMenu();
              }
            }}
          />
          <div className={styles.tabGroupColorPicker} role="group" aria-label="分组颜色">
            {WORKSPACE_TAB_GROUP_COLORS.map((color) => (
              <button
                key={color.id}
                type="button"
                className={styles.tabGroupColorButton}
                data-selected={contextGroup.color === color.id ? 'true' : undefined}
                aria-label={color.label}
                aria-pressed={contextGroup.color === color.id}
                onClick={() => {
                  props.onSetGroupColor(contextGroup.id, color.id);
                  setContextGroup((current) =>
                    current ? { ...current, color: color.id } : current,
                  );
                }}
              >
                <span className={styles.tabGroupColorDot} data-color={color.id} />
              </button>
            ))}
          </div>
          <div className={styles.tabContextMenuSeparator} />
          <button
            type="button"
            role="menuitem"
            className={styles.tabContextMenuItem}
            disabled={props.busy}
            onClick={() => {
              void props.onStartNewConversationInGroup(contextGroup.id);
              closeContextMenu();
            }}
          >
            <Plus size={15} aria-hidden />
            <span>在组中创建新临时会话</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.tabContextMenuItem}
            onClick={openGroupRenameDialog}
          >
            <Pencil size={15} aria-hidden />
            <span>重命名分组</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.tabContextMenuItem}
            onClick={() => {
              props.onUngroupGroup(contextGroup.id);
              closeContextMenu();
            }}
          >
            <FolderOpen size={15} aria-hidden />
            <span>取消分组</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.tabContextMenuItem}
            disabled
            title="请逐个关闭，以保留临时会话的保存确认"
          >
            <X size={15} aria-hidden />
            <span>关闭分组标签页</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.tabContextMenuItem}
            disabled
            title="当前应用只有一个窗口"
          >
            <ChevronRight size={15} aria-hidden />
            <span>移动到新窗口</span>
          </button>
        </div>
      )}
      <Dialog
        open={naming !== null}
        onOpenChange={(open) => {
          if (!open) {
            setNaming(null);
            setSaveAndCloseTab(null);
            setRenamingGroup(null);
          }
        }}
      >
        <DialogContent className={styles.namingDialog}>
          <DialogHeader className={styles.namingHeader}>
            <DialogTitle className={styles.namingTitle}>
              {naming === 'create'
                ? '新建项目'
                : naming === 'rename-group'
                  ? '重命名分组'
                  : '保存为项目'}
            </DialogTitle>
            <DialogDescription className={styles.namingDescription}>
              {naming === 'rename-group'
                ? '名称和颜色只影响当前工作区标签布局。'
                : '给研究起一个名字，方便之后继续。'}
            </DialogDescription>
          </DialogHeader>
          <form
            className={styles.namingForm}
            onSubmit={async (event) => {
              event.preventDefault();
              if (!name.trim()) return;
              if (naming === 'create') {
                props.onCreateProject(name.trim());
              } else if (naming === 'rename-group') {
                if (renamingGroup) props.onRenameGroup(renamingGroup.id, name.trim());
              } else {
                const conversationId = saveAndCloseTab?.id ?? props.activeTabId;
                const saved = await props.onPromoteConversation(
                  conversationId,
                  name.trim(),
                );
                if (saved && saveAndCloseTab) {
                  props.onCloseTab(saveAndCloseTab.id);
                  setSaveAndCloseTab(null);
                }
                if (!saved) return;
              }
              setNaming(null);
            }}
          >
            <Input
              aria-label={
                naming === 'rename-group'
                  ? '分组名称'
                  : '项目名称'
              }
              placeholder={
                naming === 'rename-group'
                  ? '输入分组名称'
                  : '例如：大豆多环境试验'
              }
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              maxLength={120}
            />
            <DialogFooter className={styles.namingActions}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setNaming(null);
                  setSaveAndCloseTab(null);
                }}
              >
                取消
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                确定
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {props.inProject && <div className={styles.projectContext}>
        <div className={styles.eyebrow}>
          <span className={styles.statusDot} aria-hidden />
          <span>育种研究对话</span>
        </div>
        <div className={styles.projectRow}>
          <h1>lian</h1>
          <span className={styles.divider} aria-hidden />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={styles.contextSwitcher}>
                <span>{props.contextLabel}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className={styles.contextMenu}
            >
              <DropdownMenuItem disabled>
                当前 · {props.contextLabel}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {props.projects
                .filter((item) => item.status === 'active')
                .map((item) => (
                  <DropdownMenuItem
                    key={`project:${item.id}`}
                    onSelect={() => props.onSwitchProject(item.id)}
                  >
                    {item.name}
                  </DropdownMenuItem>
                ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={props.onStartNewConversation}>
                新的临时会话
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={createProject}>
                新建项目…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>}
      <div className={styles.headerActions}>
        {props.developerMode && !props.terminalOpen && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={styles.terminalButton}
            onClick={props.onOpenTerminal}
          >
            <Terminal size={15} aria-hidden />
            终端
          </Button>
        )}
        {props.inProject && (
          <div className={styles.contextStats} aria-label="项目概览">
            <span>
              <b>{props.datasetCount}</b> 数据集
            </span>
            <span>
              <b>{props.artifactCount}</b> 结果
            </span>
            <span>
              <b>{props.materialCount}</b> 材料
            </span>
          </div>
        )}
        {!props.inProject && (
          <button
            type="button"
            className={styles.unsavedDot}
            aria-label="关闭未保存的临时会话"
            title="未保存的临时会话，点击关闭"
            disabled={props.busy}
            onClick={() => {
              const currentTab = props.tabs.find((tab) => tab.id === props.activeTabId);
              if (currentTab) requestCloseTab(currentTab);
            }}
          >
            <Circle className={styles.unsavedDotIcon} size={8} fill="currentColor" aria-hidden />
            <X className={styles.unsavedCloseIcon} size={14} strokeWidth={1.9} aria-hidden />
          </button>
        )}
        {props.inProject && (
          <Button
            variant="ghost"
            className={styles.newProject}
            onClick={createProject}
          >
            <Plus size={15} strokeWidth={1.75} />
            新建项目
          </Button>
        )}
        {props.inProject && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                className={styles.archiveButton}
                aria-label="归档当前项目"
              >
                <Trash2 size={16} strokeWidth={1.75} />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>归档当前项目？</AlertDialogTitle>
                <AlertDialogDescription>
                  归档后项目将从活跃列表移除,会话数据保留。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={props.onArchiveProject}>
                  归档
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      <AlertDialog
        open={closingTab !== null}
        onOpenChange={(open) => !open && setClosingTab(null)}
      >
        <AlertDialogContent className={styles.saveSessionDialog}>
          <AlertDialogHeader className={styles.saveSessionDialogHeader}>
            <span className={styles.saveSessionDialogEyebrow}>
              未保存的临时会话
            </span>
            <AlertDialogTitle className={styles.saveSessionDialogTitle}>
              保存临时会话？
            </AlertDialogTitle>
            <AlertDialogDescription className={styles.saveSessionDialogDescription}>
              这次会话还没有保存为项目。保存后可以在项目列表中继续研究。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={styles.saveSessionDialogFooter}>
            <AlertDialogCancel className={styles.saveSessionDialogCancel}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              className={styles.saveSessionDialogSecondary}
              onClick={() => {
                if (closingTab) props.onCloseTab(closingTab.id);
                setClosingTab(null);
              }}
            >
              不保存，关闭
            </AlertDialogAction>
            <Button
              className={styles.saveSessionDialogPrimary}
              onClick={() => {
                setSaveAndCloseTab(closingTab);
                setClosingTab(null);
                setName('');
                setNaming('save');
              }}
            >
              保存并关闭
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}

export default function AppLayout() {
  const controller = useWorkspaceController();
  const { snapshot } = controller;
  const { experienceMode } = useSettings();
  const developerMode = experienceMode === 'developer';
  const tabLayout = useWorkspaceTabLayout(controller.tabs);
  const yoloTask = useYoloTask();
  const workbenchTasks = useMemo(
    () => createWorkbenchTasks(yoloTask.photos),
    [yoloTask.photos],
  );
  const [activeView, setActiveView] = useState<
    'conversation' | 'yolo-results' | 'file-preview' | 'terminal'
  >('conversation');
  const [yoloResultsOpen, setYoloResultsOpen] = useState(false);
  const [yoloResultsFocusId, setYoloResultsFocusId] = useState<string>();
  const [filePreview, setFilePreview] = useState<FilePreviewState | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(developerMode);
  const filePreviewRequestRef = useRef(0);
  const [importName, setImportName] = useState('');

  const openYoloResults = (photoId?: string) => {
    if (photoId) setYoloResultsFocusId(photoId);
    setYoloResultsOpen(true);
    setActiveView('yolo-results');
  };
  const closeYoloResults = () => {
    setYoloResultsOpen(false);
    setYoloResultsFocusId(undefined);
    setActiveView('conversation');
  };
  const openFilePreview = (node: WorkspaceFileNode) => {
    const kind = getFilePreviewKind(node.name);
    if (!kind || !node.relativePath) return;
    const requestId = filePreviewRequestRef.current + 1;
    filePreviewRequestRef.current = requestId;
    setActiveView('file-preview');
    setFilePreview({
      name: node.name,
      relativePath: node.relativePath,
      kind,
      language: kind === 'markdown' ? 'markdown' : 'plaintext',
      content: '',
      status: 'loading',
    });
    void workspaceApi.readWorkspaceFile(node.relativePath)
      .then((preview) => {
        if (filePreviewRequestRef.current !== requestId) return;
        setFilePreview({ ...preview, status: 'ready' });
      })
      .catch(() => {
        if (filePreviewRequestRef.current !== requestId) return;
        setFilePreview((current) =>
          current
            ? {
                ...current,
                status: 'error',
                error: '文件读取失败，请稍后重试。',
              }
            : current,
        );
      });
  };
  const activateFilePreview = () => {
    if (filePreview) setActiveView('file-preview');
  };
  const closeFilePreview = () => {
    filePreviewRequestRef.current += 1;
    setFilePreview(null);
    setActiveView('conversation');
  };
  const openTerminal = () => {
    if (!developerMode) return;
    setTerminalOpen(true);
    setActiveView('terminal');
  };
  const closeTerminal = () => {
    setTerminalOpen(false);
    setActiveView((view) => (view === 'terminal' ? 'conversation' : view));
  };
  const activateConversation = (id: string) => {
    setActiveView('conversation');
    void controller.activateTab(id);
  };
  const startNewConversation = () => {
    setActiveView('conversation');
    void controller.startNewConversation();
  };
  const startNewConversationInGroup = async (groupId: string) => {
    setActiveView('conversation');
    const tabId = await controller.startNewConversation();
    if (tabId) tabLayout.setTabGroup(tabId, groupId);
  };
  const switchProject = (id: string) => {
    setActiveView('conversation');
    void controller.switchProject(id);
  };

  useEffect(() => {
    setImportName(controller.pendingImportName ?? '');
  }, [controller.pendingImportName]);

  useEffect(() => {
    void workspaceApi.setTerminalAccess(developerMode);
    if (developerMode) {
      setTerminalOpen(true);
      return;
    }
    setTerminalOpen(false);
    setActiveView((view) => (view === 'terminal' ? 'conversation' : view));
  }, [developerMode]);

  if (!snapshot) {
    return <LoadingShell />;
  }

  const project = snapshot.project;
  const latestPlan = snapshot.taskPlans[0];
  const latestRun = latestPlan
    ? snapshot.workflowRuns.find((run) => run.taskPlanId === latestPlan.id)
    : undefined;

  return (
    <AgentShell
      projects={controller.projects}
      projectId={project?.id}
      busy={controller.busy}
      onNewConversation={startNewConversation}
      onSwitchProject={switchProject}
      onOpenYoloResults={openYoloResults}
      yoloTask={yoloTask}
      workbenchOpen={controller.workbenchOpen}
      onToggleWorkbench={() => controller.setWorkbenchOpen((value) => !value)}
      workbench={
        <WorkbenchPanel
          embedded
          snapshot={snapshot}
          latestPlan={latestPlan}
          latestRun={latestRun}
          tasks={workbenchTasks}
          activeRunId={controller.activeRunId}
          busy={controller.busy}
          onConfirm={(id) => void controller.confirmPlan(id)}
          onCancel={(id) => void controller.cancelWorkflow(id)}
          onOpenFile={openFilePreview}
        />
      }
    >
      <main className={styles.main}>
        <ContextHeader
          activeView={activeView}
          tabs={tabLayout.orderedTabs}
          tabGroups={tabLayout.groups}
          activeTabId={snapshot.conversation.id}
          busy={controller.busy}
          onActivateTab={activateConversation}
          onMoveTabBefore={tabLayout.moveTabBefore}
          onGroupTabWith={tabLayout.groupTabWith}
          onMoveTabToGroup={tabLayout.moveTabToGroup}
          onUngroupTab={tabLayout.ungroupTab}
          onSetTabGroup={tabLayout.setTabGroup}
          onCloseTab={(id) => void controller.closeTab(id)}
          onCopyConversation={(id) => controller.cloneConversation(id)}
          onRenameTab={tabLayout.renameTab}
          onRenameGroup={tabLayout.renameGroup}
          onSetGroupColor={tabLayout.setGroupColor}
          onUngroupGroup={tabLayout.ungroupGroup}
          contextLabel={project ? project.name : '临时会话'}
          inProject={Boolean(project)}
          projects={controller.projects}
          datasetCount={snapshot.datasets.length}
          artifactCount={snapshot.artifacts.length}
          materialCount={snapshot.materials?.length ?? 0}
          onSwitchProject={switchProject}
          onCreateProject={(name) => void controller.createProject(name)}
          onArchiveProject={() => void controller.archiveProject()}
          onStartNewConversation={startNewConversation}
          onStartNewConversationInGroup={startNewConversationInGroup}
          onPromoteConversation={(id, name) => controller.promoteConversation(id, name)}
          yoloResultsOpen={yoloResultsOpen}
          onOpenYoloResults={openYoloResults}
          onCloseYoloResults={closeYoloResults}
          filePreview={filePreview}
          onOpenFilePreview={activateFilePreview}
          onCloseFilePreview={closeFilePreview}
          developerMode={developerMode}
          terminalOpen={terminalOpen}
          onOpenTerminal={openTerminal}
          onCloseTerminal={closeTerminal}
        />
        <section className={styles.workspace}>
          {activeView === 'yolo-results' ? (
            <YoloResultsPanel
              photos={yoloTask.photos}
              initialPhotoId={yoloResultsFocusId}
              loadThumbnail={yoloTask.loadThumbnail}
              loadImagePreview={yoloTask.loadImagePreview}
              loadResultPreview={yoloTask.loadResultPreview}
              exportCsv={yoloTask.exportCsv}
            />
          ) : activeView === 'file-preview' && filePreview ? (
            <WorkspaceFilePreviewPanel preview={filePreview} />
          ) : activeView === 'terminal' && terminalOpen ? (
            <TerminalPanel developerMode={developerMode} />
          ) : (
            <>
              <WorkspaceTimeline
                key={snapshot.conversation.id}
                messages={snapshot.messages}
                onSuggestion={(value) => {
                  controller.setIntent(value);
                  document
                    .querySelector<HTMLTextAreaElement>(
                      'textarea[aria-label="研究问题"]',
                    )
                    ?.focus();
                }}
                inspection={controller.inspection}
                mappingEdits={controller.mappingEdits}
                onMappingChange={(sourceId, value) =>
                  controller.setMappingEdits((current) => ({
                    ...current,
                    [sourceId]: value,
                  }))
                }
                onRegister={(candidates, projectId, importSessionId, resolutions) =>
                  void controller.registerCandidates(
                    candidates,
                    projectId,
                    importSessionId,
                    resolutions,
                  )
                }
                onRetry={(content) => void controller.submitQuestion(content)}
              />
              <WorkspaceComposer
                intent={controller.intent}
                busy={controller.busy}
                onIntentChange={controller.setIntent}
                onChooseData={(directory) => void controller.chooseData(directory)}
                onSubmit={() => void controller.submitQuestion()}
              />
            </>
          )}
        </section>
      </main>
      <Dialog
        open={controller.pendingImportName !== null}
        onOpenChange={(open) => {
          if (!open) void controller.resolvePendingImportName(null);
        }}
      >
        <DialogContent className={styles.namingDialog}>
          <DialogHeader className={styles.namingHeader}>
            <DialogTitle className={styles.namingTitle}>
              保存为项目后导入
            </DialogTitle>
            <DialogDescription className={styles.namingDescription}>
              数据需要归属到一个项目，便于后续继续研究。
            </DialogDescription>
          </DialogHeader>
          <form
            className={styles.namingForm}
            onSubmit={(event) => {
              event.preventDefault();
              void controller.resolvePendingImportName(importName);
            }}
          >
            <Input
              aria-label="导入项目名称"
              placeholder="例如：大豆多环境试验"
              value={importName}
              onChange={(event) => setImportName(event.target.value)}
              autoFocus
              maxLength={120}
            />
            <DialogFooter className={styles.namingActions}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void controller.resolvePendingImportName(null)}
              >
                取消
              </Button>
              <Button type="submit" disabled={!importName.trim()}>
                确定
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AgentShell>
  );
}
