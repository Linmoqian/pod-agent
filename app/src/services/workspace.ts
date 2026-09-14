/*
 * lian 工作区的 Tauri IPC 客户端契约。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { invoke } from '@tauri-apps/api/core';

import type {
  ArtifactDetail,
  Dataset,
  ImportInspection,
  Project,
  TaskPlan,
  WorkflowRun,
  WorkspaceSnapshot,
} from '../features/workspace/types';

/** 普通浏览器只用于 UI 预览;真实 IPC 仅在 Tauri WebView 中可用。 */
export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function createBrowserPreviewSnapshot(): WorkspaceSnapshot {
  const now = new Date().toISOString();
  return {
    conversation: {
      id: 'browser-preview',
      projectId: null,
      title: '浏览器预览',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    project: null,
    datasets: [],
    artifacts: [],
    taskPlans: [],
    workflowRuns: [],
    messages: [],
  };
}

export const workspaceApi = {
  listProjects() {
    return invoke<Project[]>('list_projects');
  },
  createProject(name: string) {
    return invoke<Project>('create_project', { name });
  },
  archiveProject(projectId: string) {
    return invoke<Project>('archive_project', { projectId });
  },
  ensureDraftProject(nameHint?: string) {
    return invoke<Project>('ensure_draft_project', { nameHint });
  },
  ensureConversation() {
    return invoke<WorkspaceSnapshot>('ensure_active_conversation');
  },
  getConversationContext(conversationId: string) {
    return invoke<WorkspaceSnapshot>('get_conversation_context', {
      conversationId,
    });
  },
  openProjectContext(projectId: string) {
    return invoke<WorkspaceSnapshot>('open_project_context', { projectId });
  },
  newTemporaryConversation() {
    return invoke<WorkspaceSnapshot>('new_temporary_conversation');
  },
  sendMessage(conversationId: string, content: string) {
    return invoke<WorkspaceSnapshot>('send_message', {
      conversationId,
      content,
    });
  },
  promoteConversation(conversationId: string, name: string) {
    return invoke<WorkspaceSnapshot>('promote_conversation', {
      conversationId,
      name,
    });
  },
  inspectDataSources(projectId: string, paths: string[]) {
    return invoke<ImportInspection>('inspect_data_sources', {
      projectId,
      paths,
    });
  },
  registerDatasets(
    projectId: string,
    registrations: Array<{ sourceId: string; mapping: unknown }>,
  ) {
    return invoke<Dataset[]>('register_datasets', { projectId, registrations });
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
    return invoke<Dataset[]>('confirm_data_import', {
      projectId,
      request: { importSessionId, registrations, resolutions: [] },
    });
  },
  submitIntent(
    projectId: string,
    intent: string,
    datasetIds: string[],
    conversationId: string,
  ) {
    return invoke<TaskPlan>('submit_agent_intent', {
      projectId,
      intent,
      datasetIds,
      conversationId,
    });
  },
  submitResearchIntent(
    projectId: string,
    intent: string,
    inputs: Array<{ kind: string; id: string }>,
  ) {
    return invoke<TaskPlan>('submit_research_intent', {
      projectId,
      intent,
      inputs,
    });
  },
  confirmPlan(planId: string) {
    return invoke<WorkflowRun>('confirm_task_plan', { planId });
  },
  startTaskPlanRun(planId: string) {
    return invoke<WorkflowRun>('start_task_plan_run', { planId });
  },
  cancelWorkflow(runId: string) {
    return invoke<void>('cancel_workflow', { runId });
  },
  snapshot(projectId: string) {
    return invoke<WorkspaceSnapshot>('get_workspace_snapshot', { projectId });
  },
  artifactDetail(artifactId: string) {
    return invoke<ArtifactDetail>('get_artifact_detail', { artifactId });
  },
};
