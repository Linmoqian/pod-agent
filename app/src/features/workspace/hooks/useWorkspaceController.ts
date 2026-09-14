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
import type {
  Artifact,
  ImportInspection,
  Project,
  WorkspaceSnapshot,
} from '../types';
import useImportActions from './useImportActions';
import useWorkspaceLifecycle from './useWorkspaceLifecycle';
import useReplyStream from './useReplyStream';

function errorText(error: unknown) {
  return typeof error === 'object' && error && 'message' in error
    ? String(error.message)
    : String(error);
}

function useConversationBootstrap(
  reportError: (error: unknown) => void,
  setSnapshot: (snapshot: WorkspaceSnapshot) => void,
) {
  useEffect(() => {
    let alive = true;
    if (!isTauriRuntime()) {
      setSnapshot(createBrowserPreviewSnapshot());
      return () => {
        alive = false;
      };
    }
    workspaceApi
      .ensureConversation()
      .then((value) => alive && setSnapshot(value))
      .catch((error) => alive && reportError(error));
    return () => {
      alive = false;
    };
  }, [reportError, setSnapshot]);
}

export default function useWorkspaceController() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [inspection, setInspection] = useState<ImportInspection | null>(null);
  const [intent, setIntent] = useState('');
  const [busy, setBusy] = useState(false);
  const [workbenchOpen, setWorkbenchOpen] = useState(true);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(
    null,
  );
  const [mappingEdits, setMappingEdits] = useState<
    Record<string, FieldMapping>
  >({});
  const submittingQuestion = useRef(false);

  const reportError = useCallback(
    (error: unknown) => toast.error(errorText(error)),
    [],
  );
  const refresh = useCallback(async (conversationId: string) => {
    setSnapshot(await workspaceApi.getConversationContext(conversationId));
  }, []);
  useConversationBootstrap(reportError, setSnapshot);
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
    resolveImportTarget: async (defaultName: string) => {
      // 项目上下文直接落当前项目；临时会话先提升为项目再导入。
      if (snapshot?.project) return snapshot.project.id;
      const name = window.prompt(
        '保存为项目（数据需要一个科研容器）',
        defaultName,
      );
      if (!name?.trim()) return null;
      const context = await workspaceApi.promoteConversation(
        String(conversationId),
        name.trim(),
      );
      setSnapshot(context);
      setProjects(await workspaceApi.listProjects());
      return context.project?.id ?? null;
    },
  });

  const submitQuestion = async () => {
    if (busy || submittingQuestion.current) return;
    if (!intent.trim() || !snapshot) return;
    if (!isTauriRuntime()) {
      toast.warning('当前为浏览器预览，发送消息请在 Tauri 桌面端运行');
      return;
    }
    submittingQuestion.current = true;
    setBusy(true);
    try {
      const dataset = snapshot.datasets[0];
      if (dataset && snapshot.project) {
        // 有数据：走受控计划通路，执行真实工作流。
        await buildPlan(
          dataset.id,
          snapshot.project.id,
          intent.trim(),
          snapshot.conversation.id,
        );
      } else {
        // 无数据：lian 仍可讨论、解释、设计与规划。
        const question = intent.trim();
        const timestamp = new Date().toISOString();
        const optimisticPrefix = `pending:${Date.now()}`;
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
                    id: `${optimisticPrefix}:assistant`,
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
      toast.error(errorText(error));
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
      setSnapshot(await workspaceApi.openProjectContext(targetProjectId));
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
      setSnapshot(await workspaceApi.openProjectContext(project.id));
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
      setSnapshot(await workspaceApi.newTemporaryConversation());
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };
  const startNewConversation = async () => {
    setBusy(true);
    try {
      setSnapshot(await workspaceApi.newTemporaryConversation());
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };
  const promoteCurrentConversation = async (name: string) => {
    if (!conversationId) return;
    setBusy(true);
    try {
      const context = await workspaceApi.promoteConversation(
        conversationId,
        name,
      );
      setSnapshot(context);
      setProjects(await workspaceApi.listProjects());
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };

  return {
    snapshot,
    projects,
    inspection,
    intent,
    busy,
    workbenchOpen,
    activeRunId,
    selectedArtifact,
    mappingEdits,
    setIntent,
    setWorkbenchOpen,
    setSelectedArtifact,
    setMappingEdits,
    submitQuestion,
    confirmPlan,
    cancelWorkflow,
    switchProject,
    createProject,
    archiveProject,
    startNewConversation,
    promoteCurrentConversation,
    chooseData,
    registerCandidates,
  };
}
