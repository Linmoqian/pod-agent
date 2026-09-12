/*
 * lian 工作区的 Tauri IPC 客户端契约。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { invoke } from "@tauri-apps/api/core";

import type {
  ArtifactDetail,
  Dataset,
  ImportInspection,
  Project,
  TaskPlan,
  WorkflowRun,
  WorkspaceSnapshot,
} from "../features/workspace/types";

export const workspaceApi = {
  ensureDraftProject(nameHint?: string) {
    return invoke<Project>("ensure_draft_project", { nameHint });
  },
  inspectDataSources(projectId: string, paths: string[]) {
    return invoke<ImportInspection>("inspect_data_sources", { projectId, paths });
  },
  registerDatasets(
    projectId: string,
    registrations: Array<{ sourceId: string; mapping: unknown }>,
  ) {
    return invoke<Dataset[]>("register_datasets", { projectId, registrations });
  },
  submitIntent(projectId: string, intent: string, datasetIds: string[]) {
    return invoke<TaskPlan>("submit_agent_intent", {
      projectId,
      intent,
      datasetIds,
    });
  },
  confirmPlan(planId: string) {
    return invoke<WorkflowRun>("confirm_task_plan", { planId });
  },
  cancelWorkflow(runId: string) {
    return invoke<void>("cancel_workflow", { runId });
  },
  snapshot(projectId: string) {
    return invoke<WorkspaceSnapshot>("get_workspace_snapshot", { projectId });
  },
  artifactDetail(artifactId: string) {
    return invoke<ArtifactDetail>("get_artifact_detail", { artifactId });
  },
};
