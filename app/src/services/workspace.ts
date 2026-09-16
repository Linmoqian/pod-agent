/*
 * lian 工作区的 Tauri IPC 客户端契约。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import type {
  ArtifactDetail,
  CloneMessageSnapshot,
  Dataset,
  ImportInspection,
  Project,
  TaskPlan,
  TerminalRunResult,
  WorkflowRun,
  WorkspaceFileNode,
  WorkspaceFilePreview,
  WorkspaceSnapshot,
} from '../features/workspace/types';
import type { AgentModelRequest } from '../features/providers/types';
import { getFrontendRuntime } from './runtime';
import { createBrowserPreviewFile } from './runtime/browserPreviewFixtures';

export { isTauriRuntime } from './runtime';

export {
  createBrowserPreviewFile,
  createBrowserPreviewFileTree,
  createBrowserPreviewSnapshot,
} from './runtime/browserPreviewFixtures';

export const workspaceApi = {
  listProjects() {
    return getFrontendRuntime().invoke<Project[]>('list_projects');
  },
  createProject(name: string) {
    return getFrontendRuntime().invoke<Project>('create_project', { name });
  },
  archiveProject(projectId: string) {
    return getFrontendRuntime().invoke<Project>('archive_project', { projectId });
  },
  ensureDraftProject(nameHint?: string) {
    return getFrontendRuntime().invoke<Project>('ensure_draft_project', { nameHint });
  },
  ensureConversation() {
    return getFrontendRuntime().invoke<WorkspaceSnapshot>('ensure_active_conversation');
  },
  getConversationContext(conversationId: string) {
    return getFrontendRuntime().invoke<WorkspaceSnapshot>('get_conversation_context', {
      conversationId,
    });
  },
  openProjectContext(projectId: string) {
    return getFrontendRuntime().invoke<WorkspaceSnapshot>('open_project_context', { projectId });
  },
  newTemporaryConversation() {
    return getFrontendRuntime().invoke<WorkspaceSnapshot>('new_temporary_conversation');
  },
  cloneConversation(conversationId: string, messages?: CloneMessageSnapshot[]) {
    return getFrontendRuntime().invoke<WorkspaceSnapshot>('clone_conversation', {
      conversationId,
      ...(messages ? { messages } : {}),
    });
  },
  sendMessage(
    conversationId: string,
    content: string,
    requestId: string,
    model?: AgentModelRequest,
  ) {
    return getFrontendRuntime().invoke<WorkspaceSnapshot>('send_message', {
      conversationId,
      content,
      requestId,
      model,
    });
  },
  promoteConversation(conversationId: string, name: string) {
    return getFrontendRuntime().invoke<WorkspaceSnapshot>('promote_conversation', {
      conversationId,
      name,
    });
  },
  inspectDataSources(projectId: string, paths: string[]) {
    return getFrontendRuntime().invoke<ImportInspection>('inspect_data_sources', {
      projectId,
      paths,
    });
  },
  registerDatasets(
    projectId: string,
    registrations: Array<{ sourceId: string; mapping: unknown }>,
  ) {
    return getFrontendRuntime().invoke<Dataset[]>('register_datasets', { projectId, registrations });
  },
  confirmDataImport(
    projectId: string,
    importSessionId: string,
    registrations: Array<{
      sourceId: string;
      mapping: unknown;
      materialResolutions?: Record<string, string>;
    }>,
  ) {
    return getFrontendRuntime().invoke<Dataset[]>('confirm_data_import', {
      projectId,
      request: { importSessionId, registrations, resolutions: [] },
    });
  },
  submitIntent(
    projectId: string,
    intent: string,
    datasetIds: string[],
    conversationId: string,
    requestId: string,
    model?: AgentModelRequest,
  ) {
    return getFrontendRuntime().invoke<TaskPlan>('submit_agent_intent', {
      projectId,
      intent,
      datasetIds,
      conversationId,
      requestId,
      model,
    });
  },
  submitResearchIntent(
    projectId: string,
    intent: string,
    inputs: Array<{ kind: string; id: string }>,
    conversationId: string | undefined,
    requestId: string,
    model?: AgentModelRequest,
  ) {
    return getFrontendRuntime().invoke<TaskPlan>('submit_research_intent', {
      projectId,
      intent,
      inputs,
      conversationId,
      requestId,
      model,
    });
  },
  cancelAgent(requestId: string) {
    return getFrontendRuntime().invoke<void>('cancel_agent', { requestId });
  },
  refreshProviderModels(providerId: string, baseUrl: string) {
    return getFrontendRuntime().invoke<string[]>('refresh_provider_models', { providerId, baseUrl });
  },
  confirmPlan(planId: string) {
    return getFrontendRuntime().invoke<WorkflowRun>('confirm_task_plan', { planId });
  },
  startTaskPlanRun(planId: string) {
    return getFrontendRuntime().invoke<WorkflowRun>('start_task_plan_run', { planId });
  },
  cancelWorkflow(runId: string) {
    return getFrontendRuntime().invoke<void>('cancel_workflow', { runId });
  },
  snapshot(projectId: string) {
    return getFrontendRuntime().invoke<WorkspaceSnapshot>('get_workspace_snapshot', { projectId });
  },
  artifactDetail(artifactId: string) {
    return getFrontendRuntime().invoke<ArtifactDetail>('get_artifact_detail', { artifactId });
  },
  listWorkspaceFiles() {
    return getFrontendRuntime().invoke<WorkspaceFileNode>('list_workspace_files');
  },
  readWorkspaceFile(relativePath: string) {
    if (getFrontendRuntime().mode === 'browser-preview')
      return Promise.resolve(createBrowserPreviewFile(relativePath));
    return getFrontendRuntime().invoke<WorkspaceFilePreview>('read_workspace_file', {
      relativePath,
    });
  },
  setTerminalAccess(enabled: boolean) {
    return getFrontendRuntime().invoke<void>('set_terminal_access', { enabled });
  },
  runTerminalCommand(command: string) {
    return getFrontendRuntime().invoke<TerminalRunResult>('run_terminal_command', {
      request: { command },
    });
  },
};
