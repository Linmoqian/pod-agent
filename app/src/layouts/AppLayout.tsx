/*
 * lian@育种台会话优先布局：lian 永远可聊，数据让它可做，项目让它可持续。
 * Created on 2026-09-12
 * Updated on 2026-09-14
 * @author: https://github.com/Linmoqian
 */

import { Circle, Plus, Trash2, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Fragment, useEffect, useState } from 'react';

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
import useWorkspaceController, {
  type WorkspaceTab,
} from '../features/workspace/hooks/useWorkspaceController';
import AgentShell from './AgentShell';
import styles from './AppLayout.module.css';

type ContextHeaderProps = {
  tabs: WorkspaceTab[];
  activeTabId: string;
  busy: boolean;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
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
  onPromoteConversation: (conversationId: string, name: string) => Promise<boolean>;
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

function ContextHeader(props: ContextHeaderProps) {
  const [naming, setNaming] = useState<'create' | 'save' | null>(null);
  const [name, setName] = useState('');
  const [closingTab, setClosingTab] = useState<WorkspaceTab | null>(null);
  const [saveAndCloseTab, setSaveAndCloseTab] = useState<WorkspaceTab | null>(null);
  const lastTemporaryTabIndex = props.tabs.reduce(
    (lastIndex, tab, index) => (tab.projectId ? lastIndex : index),
    -1,
  );
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

  return (
    <header className={styles.header}>
      <div className={styles.tabList} role="tablist" aria-label="已打开的会话">
        {props.tabs.map((tab, index) => {
          const active = tab.id === props.activeTabId;
          return (
            <Fragment key={tab.id}>
              <motion.div
                layout="position"
                className={styles.tab}
                data-active={active ? 'true' : undefined}
                transition={{ type: 'spring', stiffness: 460, damping: 36, mass: 0.7 }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={styles.tabLabel}
                  disabled={props.busy}
                  onClick={() => props.onActivateTab(tab.id)}
                >
                  <span>{tab.label}</span>
                </button>
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
              {index === lastTemporaryTabIndex && newConversationButton}
            </Fragment>
          );
        })}
        {lastTemporaryTabIndex < 0 && newConversationButton}
      </div>
      <Dialog
        open={naming !== null}
        onOpenChange={(open) => {
          if (!open) {
            setNaming(null);
            setSaveAndCloseTab(null);
          }
        }}
      >
        <DialogContent className={styles.namingDialog}>
          <DialogHeader>
            <DialogTitle>
              {naming === 'create' ? '新建项目' : '保存为项目'}
            </DialogTitle>
            <DialogDescription>
              给研究起一个名字，方便之后继续。
            </DialogDescription>
          </DialogHeader>
          <form
            className={styles.namingForm}
            onSubmit={async (event) => {
              event.preventDefault();
              if (!name.trim()) return;
              if (naming === 'create') {
                props.onCreateProject(name.trim());
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
              aria-label="项目名称"
              placeholder="例如：大豆多环境试验"
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
          <span
            className={styles.unsavedDot}
            aria-label="未保存的临时会话"
            title="未保存的临时会话，按 Ctrl+S 保存"
          >
            <Circle size={8} fill="currentColor" aria-hidden />
          </span>
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>保存临时会话？</AlertDialogTitle>
            <AlertDialogDescription>
              关闭后仍可选择将这次研究保存为项目，方便后续继续。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              onClick={() => {
                if (closingTab) props.onCloseTab(closingTab.id);
                setClosingTab(null);
              }}
            >
              仍然关闭
            </AlertDialogAction>
            <Button
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
  const [importName, setImportName] = useState('');

  useEffect(() => {
    setImportName(controller.pendingImportName ?? '');
  }, [controller.pendingImportName]);

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
      onNewConversation={() => void controller.startNewConversation()}
      onSwitchProject={(id) => void controller.switchProject(id)}
      workbenchOpen={controller.workbenchOpen}
      onToggleWorkbench={() => controller.setWorkbenchOpen((value) => !value)}
      workbench={
        <WorkbenchPanel
          embedded
          snapshot={snapshot}
          latestPlan={latestPlan}
          latestRun={latestRun}
          activeRunId={controller.activeRunId}
          busy={controller.busy}
          onConfirm={(id) => void controller.confirmPlan(id)}
          onCancel={(id) => void controller.cancelWorkflow(id)}
        />
      }
    >
      <main className={styles.main}>
        <ContextHeader
          tabs={controller.tabs}
          activeTabId={snapshot.conversation.id}
          busy={controller.busy}
          onActivateTab={(id) => void controller.activateTab(id)}
          onCloseTab={(id) => void controller.closeTab(id)}
          contextLabel={project ? project.name : '临时会话'}
          inProject={Boolean(project)}
          projects={controller.projects}
          datasetCount={snapshot.datasets.length}
          artifactCount={snapshot.artifacts.length}
          materialCount={snapshot.materials?.length ?? 0}
          onSwitchProject={(value) => void controller.switchProject(value)}
          onCreateProject={(name) => void controller.createProject(name)}
          onArchiveProject={() => void controller.archiveProject()}
          onStartNewConversation={() => void controller.startNewConversation()}
          onPromoteConversation={(id, name) => controller.promoteConversation(id, name)}
        />
        <section className={styles.workspace}>
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
        </section>
      </main>
      <Dialog
        open={controller.pendingImportName !== null}
        onOpenChange={(open) => {
          if (!open) void controller.resolvePendingImportName(null);
        }}
      >
        <DialogContent className={styles.namingDialog}>
          <DialogHeader>
            <DialogTitle>保存为项目后导入</DialogTitle>
            <DialogDescription>
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
