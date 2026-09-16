/*
 * 编排会话上下文、自由对话、计划、运行与血缘查看状态。
 * 「lian 永远可聊，数据让它可做，项目让它可持续」：无数据时走讨论通路，不再拦截。
 * Created on 2026-09-12
 * Updated on 2026-09-14
 * @author: https://github.com/Linmoqian
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAppSelector } from '../../../store';
import { errorText } from '../../../services/errors';

import {
  createBrowserPreviewSnapshot,
  workspaceApi,
} from '../../../services/workspace';
import { isBrowserPreviewRuntime } from '../../../services/runtime';
import type { FieldMapping } from '../components/SourceReview';
import type {
  CloneMessageSnapshot,
  ImportInspection,
  Project,
  TimelineMessage,
  WorkspaceSnapshot,
} from '../types';
import type { AgentModelRequest } from '../../providers/types';
import useImportActions from './useImportActions';
import useWorkspaceLifecycle from './useWorkspaceLifecycle';
import useReplyStream, { type AgentReplyDelta } from './useReplyStream';

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
  const index = tabs.findIndex((tab) => tab.id === nextTab.id);
  if (index < 0) return [...tabs, nextTab];
  const current = tabs[index];
  if (
    current.label === nextTab.label &&
    current.projectId === nextTab.projectId
  ) {
    return tabs;
  }
  return tabs.map((tab) => (tab.id === nextTab.id ? nextTab : tab));
}

function nextCloneTitle(sourceTitle: string, usedTitles: string[]) {
  const title = sourceTitle.trim() || '临时会话';
  const used = new Set(usedTitles);
  const base = `${title}（副本）`;
  if (!used.has(base)) return base;
  let number = 2;
  while (used.has(`${title}（副本 ${number}）`)) number += 1;
  return `${title}（副本 ${number}）`;
}

function cloneMessageSnapshot(messages: TimelineMessage[]): CloneMessageSnapshot[] {
  return messages.flatMap((message) => {
    if (message.role !== 'user' && message.role !== 'assistant') return [];
    const content = message.content.trim();
    const reasoning = message.reasoning?.trim() ?? '';
    // pending 助手只是一枚前端占位，不应进入独立副本。
    if (message.role === 'assistant' && !content && !reasoning) return [];
    return [{
      taskPlanId: message.taskPlanId,
      role: message.role,
      content: message.content,
      reasoning: message.reasoning ?? null,
      createdAt: message.createdAt,
    }];
  });
}

function applyReplyDelta(
  snapshot: WorkspaceSnapshot,
  delta: AgentReplyDelta,
): WorkspaceSnapshot {
  let messageIndex = -1;
  for (let index = snapshot.messages.length - 1; index >= 0; index -= 1) {
    const message = snapshot.messages[index];
    if (
      message.role === 'assistant' &&
      message.status &&
      message.requestId === delta.requestId
    ) {
      messageIndex = index;
      break;
    }
  }
  if (messageIndex < 0) return snapshot;
  const messages = [...snapshot.messages];
  const message = messages[messageIndex];
  messages[messageIndex] = {
    ...message,
    status: 'streaming',
    content: delta.kind === 'text' ? message.content + delta.delta : message.content,
    reasoning: delta.kind === 'thinking'
      ? `${message.reasoning ?? ''}${delta.delta}`
      : message.reasoning,
  };
  return { ...snapshot, messages };
}

function useConversationBootstrap(
  reportError: (error: unknown) => void,
  onSnapshot: (snapshot: WorkspaceSnapshot) => void,
) {
  useEffect(() => {
    let alive = true;
    if (isBrowserPreviewRuntime()) {
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
  const [agentRequests, setAgentRequests] = useState<Record<string, string>>({});
  const [workbenchOpen, setWorkbenchOpen] = useState(true);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [mappingEdits, setMappingEdits] = useState<
    Record<string, FieldMapping>
  >({});
  const submittingQuestions = useRef(new Set<string>());
  const importNameResolver = useRef<((projectId: string | null) => void) | null>(null);
  const previewSnapshots = useRef(new Map<string, WorkspaceSnapshot>());
  const previewTabCount = useRef(0);
  const [pendingImportName, setPendingImportName] = useState<string | null>(null);
  const { currentModel, customProviders } = useAppSelector(
    (state) => state.providers,
  );
  const agentModel = useMemo<AgentModelRequest | undefined>(() => {
    if (!currentModel) return undefined;
    const customProvider = customProviders.find(
      (provider) => provider.id === currentModel.providerId,
    );
    return {
      ...currentModel,
      ...(customProvider
        ? { customProvider: { baseUrl: customProvider.baseUrl } }
        : {}),
    };
  }, [currentModel, customProviders]);

  const reportError = useCallback(
    (error: unknown) => toast.error(errorText(error)),
    [],
  );
  const cacheSnapshot = useCallback((next: WorkspaceSnapshot) => {
    previewSnapshots.current.set(next.conversation.id, next);
    const nextTab = tabFromSnapshot(next);
    setTabs((current) => upsertTab(current, nextTab));
  }, []);
  const refresh = useCallback(async (conversationId: string) => {
    const next = await workspaceApi.getConversationContext(conversationId);
    cacheSnapshot(next);
    setSnapshot((current) =>
      current?.conversation.id === conversationId ? next : current,
    );
  }, [cacheSnapshot]);
  const activateSnapshot = useCallback((next: WorkspaceSnapshot) => {
    cacheSnapshot(next);
    setSnapshot(next);
  }, [cacheSnapshot]);
  const updateCachedSnapshot = useCallback(
    (conversationId: string, update: (current: WorkspaceSnapshot) => WorkspaceSnapshot) => {
      const current = previewSnapshots.current.get(conversationId);
      if (!current) return;
      const next = update(current);
      cacheSnapshot(next);
      setSnapshot((active) =>
        active?.conversation.id === conversationId ? next : active,
      );
    },
    [cacheSnapshot],
  );
  const setConversationAgentRequest = useCallback(
    (conversationId: string, requestId: string | null) => {
      setAgentRequests((current) => {
        if (requestId) return { ...current, [conversationId]: requestId };
        if (!(conversationId in current)) return current;
        const next = { ...current };
        delete next[conversationId];
        return next;
      });
    },
    [],
  );
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
    if (isBrowserPreviewRuntime()) {
      setProjects([]);
      return;
    }
    workspaceApi.listProjects().then(setProjects).catch(reportError);
  }, [reportError]);

  const conversationId = snapshot?.conversation.id;
  const projectId = snapshot?.project?.id;
  const activeAgentRequestId = conversationId
    ? agentRequests[conversationId] ?? null
    : null;
  const agentBusy = activeAgentRequestId !== null;
  useEffect(() => {
    if (snapshot) cacheSnapshot(snapshot);
  }, [cacheSnapshot, snapshot]);
  const handleBackgroundReplyDelta = useCallback(
    (delta: AgentReplyDelta) => {
      updateCachedSnapshot(delta.conversationId, (current) => applyReplyDelta(current, delta));
    },
    [updateCachedSnapshot],
  );
  const appendReplyDelta = useReplyStream(
    setSnapshot,
    conversationId,
    handleBackgroundReplyDelta,
  );
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
      const requestId = crypto.randomUUID();
      setConversationAgentRequest(targetConversationId, requestId);
      try {
        await workspaceApi.submitIntent(
          targetProjectId,
          question,
          [datasetId],
          targetConversationId,
          requestId,
          agentModel,
        );
        await refresh(targetConversationId);
        if (conversationId === targetConversationId) setIntent('');
        setWorkbenchOpen(true);
      } finally {
        setConversationAgentRequest(targetConversationId, null);
      }
    },
    [agentModel, conversationId, refresh, setConversationAgentRequest],
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
    if (busy || !conversationId || submittingQuestions.current.has(conversationId)) return;
    if (agentRequests[conversationId]) return;
    const question = questionOverride?.trim() || intent.trim();
    if (!question || !snapshot) return;
    if (isBrowserPreviewRuntime()) {
      toast.warning('当前为浏览器预览，发送消息请在 Tauri 桌面端运行');
      return;
    }
    const targetConversationId = conversationId;
    submittingQuestions.current.add(targetConversationId);
    const requestId = crypto.randomUUID();
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
        const assistantId = `${optimisticPrefix}:assistant`;
        optimisticAssistantId = assistantId;
        setConversationAgentRequest(targetConversationId, requestId);
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
                    id: assistantId,
                    conversationId: current.conversation.id,
                    taskPlanId: null,
                    role: 'assistant',
                    content: '',
                    status: 'pending',
                    requestId,
                    createdAt: timestamp,
                  },
                ],
              }
            : current,
        );
        setIntent('');
        const context = await workspaceApi.sendMessage(
          targetConversationId,
          question,
          requestId,
          agentModel,
        );
        cacheSnapshot(context);
        setSnapshot((current) =>
          current?.conversation.id === targetConversationId ? context : current,
        );
      }
    } catch (error) {
      const message = errorText(error);
      if (optimisticAssistantId) {
        updateCachedSnapshot(targetConversationId, (current) => ({
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
        }));
      }
      toast.error(message);
    } finally {
      setConversationAgentRequest(targetConversationId, null);
      submittingQuestions.current.delete(targetConversationId);
    }
  };

  const cancelAgent = useCallback(async () => {
    const requestId = activeAgentRequestId;
    if (!requestId) return;
    try {
      await workspaceApi.cancelAgent(requestId);
      toast.info('正在停止 Agent 请求');
    } catch (error) {
      reportError(error);
    }
  }, [activeAgentRequestId, reportError]);

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
      if (isBrowserPreviewRuntime()) {
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
  const cloningConversationId = useRef<string | null>(null);
  const cloneConversation = async (targetConversationId: string) => {
    if (!targetConversationId || cloningConversationId.current) return;
    cloningConversationId.current = targetConversationId;
    try {
      if (isBrowserPreviewRuntime()) {
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
          })).filter((message) =>
            message.role !== 'assistant' || message.content.trim() || message.reasoning?.trim(),
          ),
        };
        activateSnapshot(cloned);
        return;
      }
      const messageSnapshot =
        targetConversationId === conversationId && snapshot
          ? cloneMessageSnapshot(snapshot.messages)
          : undefined;
      const cloned = await workspaceApi.cloneConversation(targetConversationId, messageSnapshot);
      activateSnapshot(cloned);
      if (cloned.project) setProjects(await workspaceApi.listProjects());
    } catch (error) {
      reportError(error);
    } finally {
      cloningConversationId.current = null;
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
      if (isBrowserPreviewRuntime()) {
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
      if (isBrowserPreviewRuntime()) {
        const preview = previewSnapshots.current.get(tabId);
        if (preview) activateSnapshot(preview);
        return;
      }
      if (agentRequests[tabId]) {
        const cached = previewSnapshots.current.get(tabId);
        if (cached) {
          activateSnapshot(cached);
          return;
        }
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
    busy: busy || agentBusy,
    canCancel: activeAgentRequestId !== null,
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
    cancelAgent,
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
