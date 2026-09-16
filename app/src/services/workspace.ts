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
  TerminalRunResult,
  WorkflowRun,
  WorkspaceFileNode,
  WorkspaceFilePreview,
  WorkspaceSnapshot,
} from '../features/workspace/types';
import type { AgentModelRequest } from '../features/providers/types';

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

export function createBrowserPreviewFileTree(): WorkspaceFileNode {
  return {
    name: 'pod-agent',
    relativePath: '',
    directory: true,
    children: [
      {
        name: 'app',
        relativePath: 'app',
        directory: true,
        children: [
          {
            name: 'src',
            relativePath: 'app/src',
            directory: true,
            children: [
              {
                name: 'App.tsx',
                relativePath: 'app/src/App.tsx',
                directory: false,
                children: [],
              },
              {
                name: 'main.tsx',
                relativePath: 'app/src/main.tsx',
                directory: false,
                children: [],
              },
            ],
          },
          {
            name: 'src-tauri',
            relativePath: 'app/src-tauri',
            directory: true,
            children: [
              {
                name: 'src',
                relativePath: 'app/src-tauri/src',
                directory: true,
                children: [
                  {
                    name: 'main.rs',
                    relativePath: 'app/src-tauri/src/main.rs',
                    directory: false,
                    children: [],
                  },
                ],
              },
            ],
          },
          {
            name: 'README.md',
            relativePath: 'app/README.md',
            directory: false,
            children: [],
          },
        ],
      },
      {
        name: 'docs',
        relativePath: 'docs',
        directory: true,
        children: [
          {
            name: 'README.md',
            relativePath: 'docs/README.md',
            directory: false,
            children: [],
          },
        ],
      },
      {
        name: 'tests',
        relativePath: 'tests',
        directory: true,
        children: [
          {
            name: 'workspace.test.ts',
            relativePath: 'tests/workspace.test.ts',
            directory: false,
            children: [],
          },
        ],
      },
      {
        name: 'AGENTS.md',
        relativePath: 'AGENTS.md',
        directory: false,
        children: [],
      },
      {
        name: 'README.md',
        relativePath: 'README.md',
        directory: false,
        children: [],
      },
      {
        name: 'environment.yml',
        relativePath: 'environment.yml',
        directory: false,
        children: [],
      },
    ],
  };
}

const BROWSER_PREVIEW_FILES: Record<
  string,
  Omit<WorkspaceFilePreview, 'name' | 'relativePath'>
> = {
  'app/README.md': {
    kind: 'markdown',
    language: 'markdown',
    content:
      '# pod-agent\n\n这是工作区文件树的浏览器预览。\n\n- 点击左侧 Markdown 文件查看内容\n- 点击代码文件查看只读源码\n',
  },
  'app/src/App.tsx': {
    kind: 'code',
    language: 'typescript',
    content: [
      "import AppRoutes from './routes/AppRoutes';",
      '',
      'export default function App() {',
      '  return <AppRoutes />;',
      '}',
    ].join('\n'),
  },
  'app/src/main.tsx': {
    kind: 'code',
    language: 'typescript',
    content: [
      "import React from 'react';",
      "import ReactDOM from 'react-dom/client';",
      "import App from './App';",
      '',
      "ReactDOM.createRoot(document.getElementById('root')!).render(",
      '  <React.StrictMode>',
      '    <App />',
      '  </React.StrictMode>,',
      ');',
    ].join('\n'),
  },
  'app/src-tauri/src/main.rs': {
    kind: 'code',
    language: 'rust',
    content: [
      '#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]',
      '',
      'fn main() {',
      '    pod_agent_lib::run();',
      '}',
    ].join('\n'),
  },
  'docs/README.md': {
    kind: 'markdown',
    language: 'markdown',
    content: '# 文档\n\n这里展示工作区内可读的 Markdown 文件。\n',
  },
  'tests/workspace.test.ts': {
    kind: 'code',
    language: 'typescript',
    content: [
      "import { describe, expect, it } from 'vitest';",
      '',
      "describe('workspace', () => {",
      "  it('renders a file preview', () => {",
      '    expect(true).toBe(true);',
      '  });',
      '});',
    ].join('\n'),
  },
};

export function createBrowserPreviewFile(
  relativePath: string,
): WorkspaceFilePreview {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const name = normalizedPath.split('/').pop() || normalizedPath;
  return {
    name,
    relativePath: normalizedPath,
    ...(BROWSER_PREVIEW_FILES[normalizedPath] || {
      kind: 'code' as const,
      language: 'plaintext',
      content: '// 浏览器预览中没有缓存该文件内容。',
    }),
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
  cloneConversation(conversationId: string) {
    return invoke<WorkspaceSnapshot>('clone_conversation', { conversationId });
  },
  sendMessage(
    conversationId: string,
    content: string,
    requestId: string,
    model?: AgentModelRequest,
  ) {
    return invoke<WorkspaceSnapshot>('send_message', {
      conversationId,
      content,
      requestId,
      model,
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
    requestId: string,
    model?: AgentModelRequest,
  ) {
    return invoke<TaskPlan>('submit_agent_intent', {
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
    return invoke<TaskPlan>('submit_research_intent', {
      projectId,
      intent,
      inputs,
      conversationId,
      requestId,
      model,
    });
  },
  cancelAgent(requestId: string) {
    return invoke<void>('cancel_agent', { requestId });
  },
  refreshProviderModels(providerId: string, baseUrl: string) {
    return invoke<string[]>('refresh_provider_models', { providerId, baseUrl });
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
  listWorkspaceFiles() {
    return invoke<WorkspaceFileNode>('list_workspace_files');
  },
  readWorkspaceFile(relativePath: string) {
    if (!isTauriRuntime())
      return Promise.resolve(createBrowserPreviewFile(relativePath));
    return invoke<WorkspaceFilePreview>('read_workspace_file', {
      relativePath,
    });
  },
  setTerminalAccess(enabled: boolean) {
    if (!isTauriRuntime()) return Promise.resolve();
    return invoke<void>('set_terminal_access', { enabled });
  },
  runTerminalCommand(command: string) {
    if (!isTauriRuntime()) {
      return Promise.resolve<TerminalRunResult>({
        stdout: '',
        stderr: '浏览器预览不支持执行本机命令，请在 Tauri 桌面端使用。',
        status: null,
        success: false,
        truncated: false,
        durationMs: 0,
        cwd: '当前工程根目录',
      });
    }
    return invoke<TerminalRunResult>('run_terminal_command', {
      request: { command },
    });
  },
};
