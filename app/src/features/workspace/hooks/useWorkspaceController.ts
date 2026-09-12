/*
 * 编排工作区快照、计划、运行与血缘查看状态。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { App } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { workspaceApi } from '../../../services/workspace';
import type { FieldMapping } from '../components/SourceReview';
import type { Artifact, ImportInspection, WorkspaceSnapshot } from '../types';
import useImportActions from './useImportActions';
import useWorkspaceLifecycle from './useWorkspaceLifecycle';

function errorText(error: unknown) {
  return typeof error === 'object' && error && 'message' in error
    ? String(error.message)
    : String(error);
}

function useWorkspaceBootstrap(
  reportError: (error: unknown) => void,
  setSnapshot: (snapshot: WorkspaceSnapshot) => void,
) {
  useEffect(() => {
    let alive = true;
    workspaceApi
      .ensureDraftProject()
      .then((project) => workspaceApi.snapshot(project.id))
      .then((value) => alive && setSnapshot(value))
      .catch((error) => alive && reportError(error));
    return () => {
      alive = false;
    };
  }, [reportError, setSnapshot]);
}

export default function useWorkspaceController() {
  const { message } = App.useApp();
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
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

  const reportError = useCallback(
    (error: unknown) => message.error(errorText(error)),
    [message],
  );
  const refresh = useCallback(async (projectId: string) => {
    setSnapshot(await workspaceApi.snapshot(projectId));
  }, []);
  useWorkspaceBootstrap(reportError, setSnapshot);

  const projectId = snapshot?.project.id;
  useWorkspaceLifecycle(projectId, refresh, setActiveRunId);

  const buildPlan = useCallback(
    async (datasetId: string, targetProjectId: string, question: string) => {
      await workspaceApi.submitIntent(targetProjectId, question, [datasetId]);
      await refresh(targetProjectId);
      setIntent('');
      setWorkbenchOpen(true);
    },
    [refresh],
  );

  const { registerCandidates, chooseData } = useImportActions({
    intent,
    mappingEdits,
    buildPlan,
    reportError,
    reportWarning: message.warning,
    setBusy,
    setInspection,
    setMappingEdits,
  });

  const submitQuestion = async () => {
    const dataset = snapshot?.datasets[0];
    if (!dataset || !snapshot) {
      message.info('先添加一份 CSV、TSV 或 XLSX 表型数据');
      return;
    }
    if (!intent.trim()) return;
    setBusy(true);
    try {
      await buildPlan(dataset.id, snapshot.project.id, intent.trim());
    } catch (error) {
      message.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const confirmPlan = async (planId: string) => {
    setBusy(true);
    try {
      await workspaceApi.confirmPlan(planId);
    } catch (error) {
      message.error(errorText(error));
    } finally {
      setActiveRunId(null);
      if (snapshot) await refresh(snapshot.project.id);
      setBusy(false);
    }
  };

  const cancelWorkflow = async (runId: string) => {
    try {
      await workspaceApi.cancelWorkflow(runId);
      message.info('正在取消任务');
    } catch (error) {
      message.error(errorText(error));
    }
  };

  return {
    snapshot,
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
    registerCandidates,
    chooseData,
    submitQuestion,
    confirmPlan,
    cancelWorkflow,
  };
}
