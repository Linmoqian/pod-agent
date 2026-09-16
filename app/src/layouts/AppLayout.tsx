/*
 * lian@育种台会话优先布局：lian 永远可聊，数据让它可做，项目让它可持续。
 * Created on 2026-09-12
 * Updated on 2026-09-14
 * @author: https://github.com/Linmoqian
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import WorkbenchPanel from '../features/workspace/components/WorkbenchPanel';
import { useYoloTask } from '../features/workspace/components/YoloTaskCard';
import { getFilePreviewKind } from '../features/workspace/components/WorkbenchFileTreeIcons';
import { createWorkbenchTasks } from '../features/workspace/workbenchTasks';
import { workspaceApi } from '../services/workspace';
import type { WorkspaceFileNode } from '../features/workspace/types';
import useWorkspaceController from '../features/workspace/hooks/useWorkspaceController';
import AgentShell from './AgentShell';
import styles from './AppLayout.module.css';
import ContextHeader from './ContextHeader';
import LoadingShell from './LoadingShell';
import PendingImportDialog from './PendingImportDialog';
import WorkspaceContent, {
  type FilePreviewState,
  type WorkspaceView,
} from './WorkspaceContent';
import useWorkspaceTabLayout from './useWorkspaceTabLayout';
import { useSettings } from '../features/settings/context';

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
  const [activeView, setActiveView] = useState<WorkspaceView>('conversation');
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
        <WorkspaceContent
          snapshot={snapshot}
          activeView={activeView}
          yoloResultsFocusId={yoloResultsFocusId}
          yoloTask={yoloTask}
          filePreview={filePreview}
          terminalOpen={terminalOpen}
          developerMode={developerMode}
          inspection={controller.inspection}
          mappingEdits={controller.mappingEdits}
          intent={controller.intent}
          busy={controller.busy}
          canCancel={controller.canCancel}
          onSuggestion={(value) => {
            controller.setIntent(value);
            document
              .querySelector<HTMLTextAreaElement>(
                'textarea[aria-label="研究问题"]',
              )
              ?.focus();
          }}
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
          onIntentChange={controller.setIntent}
          onChooseData={(directory) => void controller.chooseData(directory)}
          onSubmit={() => void controller.submitQuestion()}
          onCancel={() => void controller.cancelAgent()}
        />
      </main>
      <PendingImportDialog
        open={controller.pendingImportName !== null}
        projectName={importName}
        onProjectNameChange={setImportName}
        onCancel={() => void controller.resolvePendingImportName(null)}
        onSubmit={() => void controller.resolvePendingImportName(importName)}
      />
    </AgentShell>
  );
}
