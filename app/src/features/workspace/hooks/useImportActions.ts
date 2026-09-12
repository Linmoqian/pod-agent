/*
 * 编排文件选择、拖放检查、歧义确认与 Dataset 登记。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { useCallback, useEffect } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';

import { workspaceApi } from '../../../services/workspace';
import type { FieldMapping } from '../components/SourceReview';
import type { ImportInspection, SourceCandidate } from '../types';

interface ImportActionsOptions {
  intent: string;
  mappingEdits: Record<string, FieldMapping>;
  buildPlan: (datasetId: string, projectId: string, question: string) => Promise<void>;
  reportError: (error: unknown) => void;
  reportWarning: (content: string) => void;
  setBusy: (busy: boolean) => void;
  setInspection: (inspection: ImportInspection | null) => void;
  setMappingEdits: (edits: Record<string, FieldMapping>) => void;
}

function sourceName(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  const name = parts[parts.length - 1] ?? '未命名育种项目';
  return name.replace(/\.(csv|tsv|txt|xlsx)$/i, '');
}

function useDragDrop(inspectPaths: (paths: string[]) => Promise<void>) {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === 'drop') void inspectPaths(event.payload.paths);
      })
      .then((value) => {
        unlisten = value;
      })
      .catch(() => undefined);
    return () => unlisten?.();
  }, [inspectPaths]);
}

export default function useImportActions(options: ImportActionsOptions) {
  const {
    intent,
    mappingEdits,
    buildPlan,
    reportError,
    reportWarning,
    setBusy,
    setInspection,
    setMappingEdits,
  } = options;
  const registerCandidates = useCallback(
    async (candidates: SourceCandidate[], projectId: string) => {
      setBusy(true);
      try {
        const registrations = candidates.map((candidate) => ({
          sourceId: candidate.sourceId,
          mapping: mappingEdits[candidate.sourceId] ?? candidate.inferredMapping,
        }));
        const datasets = await workspaceApi.registerDatasets(projectId, registrations);
        if (datasets[0]) {
          await buildPlan(
            datasets[0].id,
            projectId,
            intent.trim() || '分析这批多环境表型数据',
          );
        }
        setInspection(null);
        setMappingEdits({});
      } catch (error) {
        reportError(error);
      } finally {
        setBusy(false);
      }
    },
    [
      buildPlan,
      intent,
      mappingEdits,
      reportError,
      setBusy,
      setInspection,
      setMappingEdits,
    ],
  );

  const inspectPaths = useCallback(
    async (paths: string[]) => {
      if (!paths.length) return;
      setBusy(true);
      try {
        const project = await workspaceApi.ensureDraftProject(sourceName(paths[0]));
        const result = await workspaceApi.inspectDataSources(project.id, paths);
        setInspection(result);
        const analyzable = result.candidates.filter((candidate) => candidate.supported);
        const unsupported = result.candidates.length - analyzable.length;
        if (unsupported) reportWarning(`${unsupported} 个文件尚无 V1 适配器`);
        if (
          analyzable.length &&
          analyzable.every((candidate) => !candidate.ambiguities.length)
        ) {
          await registerCandidates(analyzable, project.id);
        }
      } catch (error) {
        reportError(error);
      } finally {
        setBusy(false);
      }
    },
    [registerCandidates, reportError, reportWarning, setBusy, setInspection],
  );

  const chooseData = useCallback(
    async (directory: boolean) => {
      const selected = await open({ directory, multiple: !directory });
      await inspectPaths(Array.isArray(selected) ? selected : selected ? [selected] : []);
    },
    [inspectPaths],
  );

  useDragDrop(inspectPaths);
  return { registerCandidates, chooseData };
}
