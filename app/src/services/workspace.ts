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
  listProjects() { return invoke<Project[]>("list_projects"); },
  createProject(name: string) { return invoke<Project>("create_project", { name }); },
  archiveProject(projectId: string) { return invoke<Project>("archive_project", { projectId }); },
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
  confirmDataImport(
    projectId: string,
    importSessionId: string,
    registrations: Array<{ sourceId: string; mapping: unknown; materialResolutions?: Record<string, string> }>,
  ) {
    return invoke<Dataset[]>("confirm_data_import", {
      projectId,
      request: { importSessionId, registrations, resolutions: [] },
    });
  },
  submitIntent(projectId: string, intent: string, datasetIds: string[]) {
    return invoke<TaskPlan>("submit_agent_intent", {
      projectId,
      intent,
      datasetIds,
    });
  },
  submitResearchIntent(projectId: string, intent: string, inputs: Array<{ kind: string; id: string }>) {
    return invoke<TaskPlan>("submit_research_intent", { projectId, intent, inputs });
  },
  confirmPlan(planId: string) {
    return invoke<WorkflowRun>("confirm_task_plan", { planId });
  },
  startTaskPlanRun(planId: string) {
    return invoke<WorkflowRun>("start_task_plan_run", { planId });
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
