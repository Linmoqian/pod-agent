/*
 * 编排文件选择、拖放检查、歧义确认与 Dataset 登记。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { useCallback, useEffect } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';

import { isTauriRuntime, workspaceApi } from '../../../services/workspace';
import type { FieldMapping } from '../components/SourceReview';
import type { ImportInspection, SourceCandidate } from '../types';

interface ImportActionsOptions {
  intent: string;
  mappingEdits: Record<string, FieldMapping>;
  buildPlan: (
    datasetId: string,
    projectId: string,
    question: string,
    conversationId: string,
  ) => Promise<void>;
  reportError: (error: unknown) => void;
  reportWarning: (content: string) => void;
  setBusy: (busy: boolean) => void;
  setInspection: (inspection: ImportInspection | null) => void;
  setMappingEdits: (edits: Record<string, FieldMapping>) => void;
  /** 解析导入目标项目：项目上下文直接复用；临时会话先提升为项目。 */
  resolveImportTarget: (defaultName: string) => Promise<string | null>;
  /** 导入后建计划要挂的当前会话。 */
  conversationId: string | undefined;
}

function sourceName(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  const name = parts[parts.length - 1] ?? '未命名育种项目';
  return name.replace(/\.(csv|tsv|txt|xlsx)$/i, '');
}

// 仅在 Tauri webview 内可用；纯浏览器打开时没有 __TAURI_INTERNALS__
function useDragDrop(inspectPaths: (paths: string[]) => Promise<void>) {
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === 'drop')
          void inspectPaths(event.payload.paths);
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
    resolveImportTarget,
    conversationId,
  } = options;
  const registerCandidates = useCallback(
    async (
      candidates: SourceCandidate[],
      projectId: string,
      importSessionId: string,
      materialResolutions: Record<string, string> = {},
    ) => {
      setBusy(true);
      try {
        const registrations = candidates.map((candidate) => ({
          sourceId: candidate.sourceId,
          mapping:
            mappingEdits[candidate.sourceId] ?? candidate.inferredMapping,
          materialResolutions,
        }));
        const datasets = await workspaceApi.confirmDataImport(
          projectId,
          importSessionId,
          registrations,
        );
        if (datasets[0] && conversationId) {
          await buildPlan(
            datasets[0].id,
            projectId,
            intent.trim() || '分析这批多环境表型数据',
            conversationId,
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
      conversationId,
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
        const projectId = await resolveImportTarget(sourceName(paths[0]));
        if (!projectId) return;
        const result = await workspaceApi.inspectDataSources(projectId, paths);
        setInspection(result);
        const analyzable = result.candidates.filter(
          (candidate) => candidate.supported,
        );
        const unsupported = result.candidates.length - analyzable.length;
        if (unsupported) reportWarning(`${unsupported} 个文件尚无 V1 适配器`);
        if (
          analyzable.length &&
          analyzable.every((candidate) => !candidate.ambiguities.length)
        ) {
          await registerCandidates(
            analyzable,
            projectId,
            result.importSessionId,
          );
        }
      } catch (error) {
        reportError(error);
      } finally {
        setBusy(false);
      }
    },
    [
      registerCandidates,
      reportError,
      reportWarning,
      resolveImportTarget,
      setBusy,
      setInspection,
    ],
  );

  const chooseData = useCallback(
    async (directory: boolean) => {
      // 浏览器环境没有 Tauri 对话框，直接提示而不是抛错
      if (!isTauriRuntime()) {
        reportWarning('当前运行在浏览器中，仅 Tauri 桌面端支持选择文件与拖放导入');
        return;
      }
      const selected = await open({ directory, multiple: !directory });
      await inspectPaths(
        Array.isArray(selected) ? selected : selected ? [selected] : [],
      );
    },
    [inspectPaths, reportWarning],
  );

  useDragDrop(inspectPaths);
  return { registerCandidates, chooseData };
}
