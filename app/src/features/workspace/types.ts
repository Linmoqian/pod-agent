/*
 * lian 科研对象、执行记录与生命周期事件的前端类型。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

export type Project = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

/** 对话是 lian 的交互单元；projectId 为空表示临时会话，Project 只是可选容器。 */
export type Conversation = {
  id: string;
  projectId: string | null;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type TraitSchema = {
  id: string;
  name: string;
  valueType: string;
  unit: string | null;
};

export type Dataset = {
  id: string;
  projectId: string;
  name: string;
  datasetType: string;
  version: number;
  schema: { traits?: TraitSchema[]; [key: string]: unknown };
  source: Record<string, unknown>;
  metadata: Record<string, unknown>;
  qualityStatus: string;
  supersedesId: string | null;
  createdAt: string;
};

export type ArtifactFile = {
  name: string;
  contentType: string;
  size: number;
  checksum: string;
};

export type Artifact = {
  id: string;
  projectId: string;
  artifactType: string;
  name: string;
  status: string;
  files: ArtifactFile[];
  checksum: string;
  upstreamIds: string[];
  producedByRunId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type PlanStep = {
  id: string;
  toolId: string;
  title: string;
  status: string;
  riskLevel: string;
  dependsOn?: string[];
  parameters?: Record<string, unknown>;
  expectedArtifacts?: string[];
};

export type TaskPlan = {
  id: string;
  projectId: string;
  datasetId: string;
  title: string;
  intent: string;
  goal?: string;
  inputs?: Array<{ kind: string; id: string }>;
  risks?: string[];
  traitId: string;
  planner: { mode?: string; model?: string | null; summary?: string };
  modelSpec: Record<string, unknown>;
  expectedArtifacts: string[];
  status: string;
  steps: PlanStep[];
  createdAt: string;
};

export type WorkflowRun = {
  id: string;
  taskPlanId: string;
  projectId: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type TimelineMessage = {
  id: string;
  conversationId: string;
  taskPlanId: string | null;
  role: string;
  content: string;
  reasoning?: string | null;
  /** 仅在前端等待本轮真实 Agent 结果时使用，不持久化。 */
  status?: 'pending' | 'streaming';
  createdAt: string;
};

export type WorkspaceSnapshot = {
  conversation: Conversation;
  project: Project | null;
  overview?: ProjectOverview;
  datasets: Dataset[];
  schemas?: ResearchSchema[];
  materials?: Material[];
  traits?: TraitDefinition[];
  environments?: Environment[];
  artifacts: Artifact[];
  taskPlans: TaskPlan[];
  taskPlanRuns?: TaskPlanRun[];
  executions?: Execution[];
  workflowRuns: WorkflowRun[];
  messages: TimelineMessage[];
};

export type SourceCandidate = {
  sourceId: string;
  name: string;
  format: string;
  size: number;
  checksum: string;
  sheets: string[];
  rowCount: number;
  columns: string[];
  inferredMapping: Record<string, Record<string, string | null>>;
  traits: string[];
  ambiguities: string[];
  supported: boolean;
  materialValues?: string[];
  environmentValues?: string[];
  identitySuggestions?: IdentitySuggestion[];
};

export type ImportInspection = {
  projectId: string;
  importSessionId: string;
  candidates: SourceCandidate[];
};

export type ProjectOverview = {
  project: Project;
  materialCount: number;
  datasetCount: number;
  executionCount: number;
  artifactCount: number;
  pendingResolutionCount: number;
  facts: string[];
};

export type ResearchSchema = {
  id: string;
  projectId: string;
  datasetType: string;
  version: number;
  layout: string;
  fields: unknown;
  roles: unknown;
  checksum: string;
  createdAt: string;
};
export type Material = {
  id: string;
  projectId: string;
  canonicalCode: string;
  displayName: string;
  origin: string | null;
  generation: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};
export type TraitDefinition = {
  id: string;
  projectId: string;
  canonicalCode: string;
  name: string;
  valueType: string;
  unit: string | null;
  method: string | null;
  scale: string | null;
  ontologyRef: string | null;
  createdAt: string;
};
export type Environment = {
  id: string;
  projectId: string;
  canonicalCode: string;
  name: string;
  location: string | null;
  year: number | null;
  season: string | null;
  treatment: unknown;
  metadata: unknown;
  createdAt: string;
};
export type TaskPlanRun = WorkflowRun;
export type Execution = {
  id: string;
  taskPlanRunId: string;
  projectId: string;
  stepId: string;
  toolId: string;
  toolVersion: string;
  inputs: unknown;
  parameters: unknown;
  runtime: unknown;
  status: string;
  reproducibilityFingerprint: string;
  exitCode: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  logsTruncated: boolean;
  startedAt: string;
  finishedAt: string | null;
};
export type IdentitySuggestion = {
  sourceValue: string;
  targetMaterialId: string;
  targetCode: string;
  reasonCode: string;
};

export type ToolRun = {
  id: string;
  workflowRunId: string;
  toolId: string;
  toolVersion: string;
  input: unknown;
  output: unknown;
  status: string;
  log: string;
  startedAt: string;
  finishedAt: string | null;
};

export type ArtifactDetail = {
  artifact: Artifact;
  upstream: Artifact[];
  dataset: Dataset | null;
  toolRuns: ToolRun[];
};

export type LifecycleEvent = {
  eventId: string;
  projectId: string;
  taskId: string | null;
  runId: string | null;
  timestamp: string;
  eventType: string;
  payload: Record<string, unknown>;
};
