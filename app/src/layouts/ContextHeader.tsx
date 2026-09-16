/*
 * lian 工作区头部：选项卡、项目上下文与相关操作。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import {
  ChevronRight,
  Copy,
  FileCode2,
  FileText,
  FolderOpen,
  Images,
  MessageSquare,
  Pencil,
  Plus,
  Terminal,
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

import { Button } from '@/components/ui/button';

import type { WorkspaceTab } from '../features/workspace/hooks/useWorkspaceController';
import type { FilePreviewState, WorkspaceView } from './WorkspaceContent';
import styles from './AppLayout.module.css';
import ContextHeaderActions from './ContextHeaderActions';
import ContextHeaderDialogs, {
  type ContextHeaderNaming,
} from './ContextHeaderDialogs';
import {
  type WorkspaceTabGroup,
  type WorkspaceTabGroupColor,
  WORKSPACE_TAB_GROUP_COLORS,
} from './useWorkspaceTabLayout';

type ContextHeaderProps = {
  activeView: WorkspaceView;
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
  onCloneConversation: (conversationId: string) => Promise<void>;
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
  filePreview: FilePreviewState | null;
  onOpenFilePreview: () => void;
  onCloseFilePreview: () => void;
  developerMode: boolean;
  terminalOpen: boolean;
  onOpenTerminal: () => void;
  onCloseTerminal: () => void;
};

type DragPreviewState = {
  tabId: string;
  x: number;
  y: number;
  width: number;
};

function clearTextSelection() {
  window.getSelection()?.removeAllRanges();
}

export default function ContextHeader(props: ContextHeaderProps) {
  const reduced = useReducedMotion();
  const [naming, setNaming] = useState<ContextHeaderNaming>(null);
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
  const closeNaming = () => {
    setNaming(null);
    setSaveAndCloseTab(null);
    setRenamingGroup(null);
  };
  const cancelNaming = () => {
    setNaming(null);
    setSaveAndCloseTab(null);
  };
  const submitNaming = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (naming === 'create') {
      props.onCreateProject(trimmed);
    } else if (naming === 'rename-group') {
      if (renamingGroup) props.onRenameGroup(renamingGroup.id, trimmed);
    } else {
      const conversationId = saveAndCloseTab?.id ?? props.activeTabId;
      const saved = await props.onPromoteConversation(conversationId, trimmed);
      if (saved && saveAndCloseTab) {
        props.onCloseTab(saveAndCloseTab.id);
        setSaveAndCloseTab(null);
      }
      if (!saved) return;
    }
    setNaming(null);
  };
  const closeUnsavedConversation = () => {
    const currentTab = props.tabs.find((tab) => tab.id === props.activeTabId);
    if (currentTab) requestCloseTab(currentTab);
  };
  const discardClosingTab = () => {
    if (closingTab) props.onCloseTab(closingTab.id);
    setClosingTab(null);
  };
  const saveClosingTab = () => {
    setSaveAndCloseTab(closingTab);
    setClosingTab(null);
    setName('');
    setNaming('save');
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
            onClick={() => {
              void props.onCloneConversation(contextTab.id);
              closeContextMenu();
            }}
          >
            <Copy size={15} aria-hidden />
            <span>复制会话</span>
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
      <ContextHeaderActions
        inProject={props.inProject}
        contextLabel={props.contextLabel}
        projects={props.projects}
        datasetCount={props.datasetCount}
        artifactCount={props.artifactCount}
        materialCount={props.materialCount}
        developerMode={props.developerMode}
        terminalOpen={props.terminalOpen}
        busy={props.busy}
        onSwitchProject={props.onSwitchProject}
        onStartNewConversation={props.onStartNewConversation}
        onCreateProject={createProject}
        onArchiveProject={props.onArchiveProject}
        onOpenTerminal={props.onOpenTerminal}
        onCloseUnsavedConversation={closeUnsavedConversation}
      />
      <ContextHeaderDialogs
        naming={naming}
        name={name}
        closingTab={closingTab}
        onNamingOpenChange={(open) => {
          if (!open) closeNaming();
        }}
        onNameChange={setName}
        onSubmitNaming={submitNaming}
        onCancelNaming={cancelNaming}
        onCloseDialog={() => setClosingTab(null)}
        onDiscardClose={discardClosingTab}
        onSaveAndClose={saveClosingTab}
      />
    </header>
  );
}
