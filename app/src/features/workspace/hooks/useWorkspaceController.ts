/*
 * 编排会话上下文、自由对话、计划、运行与血缘查看状态。
 * 「lian 永远可聊，数据让它可做，项目让它可持续」：无数据时走讨论通路，不再拦截。
 * Created on 2026-09-12
 * Updated on 2026-09-14
 * @author: https://github.com/Linmoqian
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  createBrowserPreviewSnapshot,
  isTauriRuntime,
  workspaceApi,
} from '../../../services/workspace';
import type { FieldMapping } from '../components/SourceReview';
import type { ImportInspection, Project, WorkspaceSnapshot } from '../types';
import useImportActions from './useImportActions';
import useWorkspaceLifecycle from './useWorkspaceLifecycle';
import useReplyStream from './useReplyStream';

function errorText(error: unknown) {
  return typeof error === 'object' && error && 'message' in error
    ? String(error.message)
    : String(error);
}

export type WorkspaceTab = {
  id: string;
  label: string;
  projectId: string | null;
};

function tabFromSnapshot(snapshot: WorkspaceSnapshot): WorkspaceTab {
  return {
    id: snapshot.conversation.id,
    label: snapshot.project?.name ?? snapshot.conversation.title,
    projectId: snapshot.project?.id ?? null,
  };
}

function upsertTab(tabs: WorkspaceTab[], nextTab: WorkspaceTab) {
  return tabs.some((tab) => tab.id === nextTab.id)
    ? tabs.map((tab) => (tab.id === nextTab.id ? nextTab : tab))
    : [...tabs, nextTab];
}

function nextCloneTitle(sourceTitle: string, usedTitles: string[]) {
  const title = sourceTitle.trim() || '临时会话';
  const used = new Set(usedTitles);
  let suffixStart = title.length;
  for (let index = title.length - 1; index >= 0; index -= 1) {
    if (/\d/.test(title[index])) suffixStart = index;
    else break;
  }
  const prefix = title.slice(0, suffixStart);
  const suffix = title.slice(suffixStart);
  let number = Number.parseInt(suffix, 10);
  if (!Number.isSafeInteger(number)) number = 2;
  else number += 1;
  const base = prefix.trim() ? prefix : title;
  while (used.has(`${base}${number}`)) number += 1;
  return `${base}${number}`;
}

function useConversationBootstrap(
  reportError: (error: unknown) => void,
  onSnapshot: (snapshot: WorkspaceSnapshot) => void,
) {
  useEffect(() => {
    let alive = true;
    if (!isTauriRuntime()) {
      onSnapshot(createBrowserPreviewSnapshot());
      return () => {
        alive = false;
      };
    }
    workspaceApi
      .ensureConversation()
      .then((value) => alive && onSnapshot(value))
      .catch((error) => alive && reportError(error));
    return () => {
      alive = false;
    };
  }, [onSnapshot, reportError]);
}

export default function useWorkspaceController() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [inspection, setInspection] = useState<ImportInspection | null>(null);
  const [intent, setIntent] = useState('');
  const [busy, setBusy] = useState(false);
  const [workbenchOpen, setWorkbenchOpen] = useState(true);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [mappingEdits, setMappingEdits] = useState<
    Record<string, FieldMapping>
  >({});
  const submittingQuestion = useRef(false);
  const importNameResolver = useRef<((projectId: string | null) => void) | null>(null);
  const previewSnapshots = useRef(new Map<string, WorkspaceSnapshot>());
  const previewTabCount = useRef(0);
  const [pendingImportName, setPendingImportName] = useState<string | null>(null);

  const reportError = useCallback(
    (error: unknown) => toast.error(errorText(error)),
    [],
  );
  const refresh = useCallback(async (conversationId: string) => {
    setSnapshot(await workspaceApi.getConversationContext(conversationId));
  }, []);
  const activateSnapshot = useCallback((next: WorkspaceSnapshot) => {
    previewSnapshots.current.set(next.conversation.id, next);
    setSnapshot(next);
    const nextTab = tabFromSnapshot(next);
    setTabs((current) => upsertTab(current, nextTab));
  }, []);
  const createPreviewConversation = useCallback(() => {
    const preview = createBrowserPreviewSnapshot();
    previewTabCount.current += 1;
    const index = previewTabCount.current;
    return {
      ...preview,
      conversation: {
        ...preview.conversation,
        id: `browser-preview-${index}`,
        title: `临时会话 ${index}`,
      },
    };
  }, []);
  useConversationBootstrap(reportError, activateSnapshot);
  useEffect(() => {
    if (!isTauriRuntime()) {
      setProjects([]);
      return;
    }
    workspaceApi.listProjects().then(setProjects).catch(reportError);
  }, [reportError]);

  const conversationId = snapshot?.conversation.id;
  const projectId = snapshot?.project?.id;
  const appendReplyDelta = useReplyStream(setSnapshot);
  useWorkspaceLifecycle(
    projectId,
    conversationId,
    refresh,
    setActiveRunId,
    appendReplyDelta,
  );

  const buildPlan = useCallback(
    async (
      datasetId: string,
      targetProjectId: string,
      question: string,
      targetConversationId: string,
    ) => {
      await workspaceApi.submitIntent(
        targetProjectId,
        question,
        [datasetId],
        targetConversationId,
      );
      await refresh(targetConversationId);
      setIntent('');
      setWorkbenchOpen(true);
    },
    [refresh],
  );

  const resolveImportTarget = useCallback(
    async (defaultName: string) => {
      // 项目上下文直接落当前项目；临时会话交由应用内命名弹窗提升。
      if (snapshot?.project) return snapshot.project.id;
      return new Promise<string | null>((resolve) => {
        importNameResolver.current = resolve;
        setPendingImportName(defaultName);
      });
    },
    [snapshot?.project],
  );
  const resolvePendingImportName = useCallback(
    async (name: string | null) => {
      const resolve = importNameResolver.current;
      importNameResolver.current = null;
      setPendingImportName(null);
      if (!resolve || !name?.trim() || !conversationId) {
        resolve?.(null);
        return;
      }
      try {
        const context = await workspaceApi.promoteConversation(
          conversationId,
          name.trim(),
        );
        activateSnapshot(context);
        setProjects(await workspaceApi.listProjects());
        resolve(context.project?.id ?? null);
      } catch (error) {
        reportError(error);
        resolve(null);
      }
    },
    [activateSnapshot, conversationId, reportError],
  );

  const { registerCandidates, chooseData } = useImportActions({
    intent,
    mappingEdits,
    buildPlan,
    conversationId,
    reportError,
    reportWarning: toast.warning,
    setBusy,
    setInspection,
    setMappingEdits,
    resolveImportTarget,
  });

  const submitQuestion = async (questionOverride?: string) => {
    if (busy || submittingQuestion.current) return;
    const question = questionOverride?.trim() || intent.trim();
    if (!question || !snapshot) return;
    if (!isTauriRuntime()) {
      toast.warning('当前为浏览器预览，发送消息请在 Tauri 桌面端运行');
      return;
    }
    submittingQuestion.current = true;
    setBusy(true);
    let optimisticAssistantId: string | null = null;
    try {
      const dataset = snapshot.datasets[0];
      if (dataset && snapshot.project) {
        // 有数据：走受控计划通路，执行真实工作流。
        await buildPlan(
          dataset.id,
          snapshot.project.id,
          question,
          snapshot.conversation.id,
        );
      } else {
        // 无数据：lian 仍可讨论、解释、设计与规划。
        const timestamp = new Date().toISOString();
        const optimisticPrefix = `pending:${Date.now()}`;
        optimisticAssistantId = `${optimisticPrefix}:assistant`;
        setSnapshot((current) =>
          current
            ? {
                ...current,
                messages: [
                  ...current.messages,
                  {
                    id: `${optimisticPrefix}:user`,
                    conversationId: current.conversation.id,
                    taskPlanId: null,
                    role: 'user',
                    content: question,
                    createdAt: timestamp,
                  },
                  {
                    id: optimisticAssistantId,
                    conversationId: current.conversation.id,
                    taskPlanId: null,
                    role: 'assistant',
                    content: '',
                    status: 'pending',
                    createdAt: timestamp,
                  },
                ],
              }
            : current,
        );
        setIntent('');
        const context = await workspaceApi.sendMessage(
          snapshot.conversation.id,
          question,
        );
        setSnapshot(context);
      }
    } catch (error) {
      const message = errorText(error);
      if (optimisticAssistantId) {
        setSnapshot((current) =>
          current
          ? {
              ...current,
              messages: current.messages.map((item) =>
                item.id === optimisticAssistantId
                  ? {
                      ...item,
                      status: 'error',
                      errorMessage: message,
                      retryContent: question,
                    }
                  : item,
              ),
            }
          : current,
        );
      }
      toast.error(message);
    } finally {
      submittingQuestion.current = false;
      setBusy(false);
    }
  };

  const confirmPlan = async (planId: string) => {
    setBusy(true);
    try {
      await workspaceApi.confirmPlan(planId);
    } catch (error) {
      reportError(error);
    } finally {
      setActiveRunId(null);
      if (conversationId) await refresh(conversationId);
      setBusy(false);
    }
  };
  const cancelWorkflow = async (runId: string) => {
    try {
      await workspaceApi.cancelWorkflow(runId);
      toast.info('正在取消任务');
    } catch (error) {
      reportError(error);
    }
  };

  const switchProject = async (targetProjectId: string) => {
    setInspection(null);
    setBusy(true);
    try {
      activateSnapshot(await workspaceApi.openProjectContext(targetProjectId));
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };
  const createProject = async (name: string) => {
    setBusy(true);
    try {
      const project = await workspaceApi.createProject(name);
      setProjects(await workspaceApi.listProjects());
      activateSnapshot(await workspaceApi.openProjectContext(project.id));
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };
  const archiveProject = async () => {
    if (!projectId) return;
    setBusy(true);
    try {
      await workspaceApi.archiveProject(projectId);
      setProjects(await workspaceApi.listProjects());
      activateSnapshot(await workspaceApi.newTemporaryConversation());
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };
  const startNewConversation = async (): Promise<string | null> => {
    setBusy(true);
    try {
      if (!isTauriRuntime()) {
        const next = createPreviewConversation();
        activateSnapshot(next);
        return next.conversation.id;
      }
      const next = await workspaceApi.newTemporaryConversation();
      activateSnapshot(next);
      return next.conversation.id;
    } catch (error) {
      reportError(error);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const cloneConversation = async (targetConversationId: string) => {
    if (!targetConversationId) return;
    setBusy(true);
    try {
      if (!isTauriRuntime()) {
        const source = previewSnapshots.current.get(targetConversationId);
        if (!source) throw new Error('会话不存在');
        previewTabCount.current += 1;
        const id = `browser-preview-${previewTabCount.current}`;
        const now = new Date().toISOString();
        const preview = createBrowserPreviewSnapshot();
        const cloned: WorkspaceSnapshot = {
          ...preview,
          conversation: {
            ...preview.conversation,
            id,
            title: nextCloneTitle(
              source.conversation.title,
              tabs.map((tab) => tab.label),
            ),
            createdAt: now,
            updatedAt: now,
          },
          messages: source.messages.map((message, index) => ({
            id: `${id}:message:${index}`,
            conversationId: id,
            taskPlanId: null,
            role: message.role,
            content: message.content,
            reasoning: message.reasoning ?? null,
            createdAt: message.createdAt,
          })),
        };
        activateSnapshot(cloned);
        return;
      }
      activateSnapshot(await workspaceApi.cloneConversation(targetConversationId));
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };
  const promoteConversation = async (
    targetConversationId: string,
    name: string,
  ): Promise<boolean> => {
    if (!targetConversationId) return false;
    setBusy(true);
    try {
      let context: WorkspaceSnapshot;
      if (!isTauriRuntime()) {
        const source = previewSnapshots.current.get(targetConversationId);
        if (!source) return false;
        const now = new Date().toISOString();
        const project: Project = {
          id: `browser-project-${targetConversationId}`,
          name,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        };
        context = {
          ...source,
          conversation: {
            ...source.conversation,
            projectId: project.id,
            title: name,
            updatedAt: now,
          },
          project,
        };
      } else {
        context = await workspaceApi.promoteConversation(
          targetConversationId,
          name,
        );
        setProjects(await workspaceApi.listProjects());
      }
      if (targetConversationId === conversationId) {
        activateSnapshot(context);
      } else {
        previewSnapshots.current.set(context.conversation.id, context);
        setTabs((current) => upsertTab(current, tabFromSnapshot(context)));
      }
      return true;
    } catch (error) {
      reportError(error);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const activateTab = async (tabId: string) => {
    if (!conversationId || tabId === conversationId) return;
    setInspection(null);
    setBusy(true);
    try {
      if (!isTauriRuntime()) {
        const preview = previewSnapshots.current.get(tabId);
        if (preview) activateSnapshot(preview);
        return;
      }
      activateSnapshot(await workspaceApi.getConversationContext(tabId));
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };
  const closeTab = async (tabId: string) => {
    const index = tabs.findIndex((item) => item.id === tabId);
    if (index < 0) return;
    const remaining = tabs.filter((item) => item.id !== tabId);
    previewSnapshots.current.delete(tabId);
    setTabs(remaining);
    if (tabId !== conversationId) return;
    const adjacent = remaining[index] ?? remaining[index - 1];
    if (adjacent) {
      await activateTab(adjacent.id);
      return;
    }
    await startNewConversation();
  };

  return {
    snapshot,
    tabs,
    projects,
    inspection,
    intent,
    busy,
    workbenchOpen,
    activeRunId,
    mappingEdits,
    pendingImportName,
    setIntent,
    setWorkbenchOpen,
    setMappingEdits,
    submitQuestion,
    confirmPlan,
    cancelWorkflow,
    switchProject,
    createProject,
    archiveProject,
    startNewConversation,
    cloneConversation,
    activateTab,
    closeTab,
    promoteConversation,
    resolvePendingImportName,
    chooseData,
    registerCandidates,
  };
}
