use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityRef {
    pub kind: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOverview {
    pub project: Project,
    pub material_count: usize,
    pub dataset_count: usize,
    pub execution_count: usize,
    pub artifact_count: usize,
    pub pending_resolution_count: usize,
    pub facts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSchema {
    pub id: String,
    pub project_id: String,
    pub dataset_type: String,
    pub version: i64,
    pub layout: String,
    pub fields: Value,
    pub roles: Value,
    pub checksum: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetVersion {
    pub id: String,
    pub dataset_id: String,
    pub project_id: String,
    pub version: i64,
    pub source_file_id: String,
    pub schema_id: String,
    pub canonical_checksum: String,
    pub quality_status: String,
    pub supersedes_version_id: Option<String>,
    pub metadata: Value,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Material {
    pub id: String,
    pub project_id: String,
    pub canonical_code: String,
    pub display_name: String,
    pub origin: Option<String>,
    pub generation: Option<String>,
    pub metadata: Value,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraitDefinition {
    pub id: String,
    pub project_id: String,
    pub canonical_code: String,
    pub name: String,
    pub value_type: String,
    pub unit: Option<String>,
    pub method: Option<String>,
    pub scale: Option<String>,
    pub ontology_ref: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub id: String,
    pub project_id: String,
    pub canonical_code: String,
    pub name: String,
    pub location: Option<String>,
    pub year: Option<i64>,
    pub season: Option<String>,
    pub treatment: Value,
    pub metadata: Value,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Execution {
    pub id: String,
    pub task_plan_run_id: String,
    pub project_id: String,
    pub step_id: String,
    pub tool_id: String,
    pub tool_version: String,
    pub inputs: Value,
    pub parameters: Value,
    pub runtime: Value,
    pub status: String,
    pub reproducibility_fingerprint: String,
    pub exit_code: Option<i64>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub stdout: Option<ArtifactFile>,
    pub stderr: Option<ArtifactFile>,
    pub logs_truncated: bool,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPlanRun {
    pub id: String,
    pub task_plan_id: String,
    pub project_id: String,
    pub status: String,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineageNode {
    pub kind: String,
    pub id: String,
    pub project_id: String,
    pub label: String,
    pub metadata: Value,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineageEdge {
    pub id: String,
    pub project_id: String,
    pub upstream_node_id: String,
    pub downstream_node_id: String,
    pub relation: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineageSubgraph {
    pub root: EntityRef,
    pub nodes: Vec<LineageNode>,
    pub edges: Vec<LineageEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterialContext {
    pub material: Material,
    pub aliases: Vec<String>,
    pub datasets: Vec<DatasetVersion>,
    pub traits: Vec<TraitDefinition>,
    pub environments: Vec<Environment>,
    pub artifacts: Vec<Artifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Dataset {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub dataset_type: String,
    pub version: i64,
    pub schema: Value,
    pub source: Value,
    pub metadata: Value,
    pub quality_status: String,
    pub supersedes_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactFile {
    pub name: String,
    pub content_type: String,
    pub size: u64,
    pub checksum: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub id: String,
    pub project_id: String,
    pub artifact_type: String,
    pub name: String,
    pub status: String,
    pub files: Vec<ArtifactFile>,
    pub checksum: String,
    pub upstream_ids: Vec<String>,
    pub produced_by_run_id: Option<String>,
    pub metadata: Value,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCandidate {
    pub source_id: String,
    pub name: String,
    pub format: String,
    pub size: u64,
    pub checksum: String,
    pub sheets: Vec<String>,
    pub row_count: usize,
    pub columns: Vec<String>,
    pub inferred_mapping: Value,
    pub traits: Vec<String>,
    pub ambiguities: Vec<String>,
    pub supported: bool,
    #[serde(default)]
    pub material_values: Vec<String>,
    #[serde(default)]
    pub environment_values: Vec<String>,
    #[serde(default)]
    pub identity_suggestions: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportInspection {
    pub project_id: String,
    pub import_session_id: String,
    pub candidates: Vec<SourceCandidate>,
}

pub type SemanticImportInspection = ImportInspection;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityResolution {
    pub entity_kind: String,
    pub source_value: String,
    pub choice: String,
    pub target_id: Option<String>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanStep {
    pub id: String,
    pub tool_id: String,
    pub title: String,
    pub status: String,
    pub risk_level: String,
    #[serde(default)]
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub parameters: Value,
    #[serde(default)]
    pub expected_artifacts: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPlan {
    pub id: String,
    pub project_id: String,
    pub dataset_id: String,
    pub title: String,
    pub intent: String,
    #[serde(default)]
    pub goal: String,
    #[serde(default)]
    pub inputs: Vec<EntityRef>,
    #[serde(default)]
    pub risks: Vec<String>,
    pub trait_id: String,
    #[serde(default)]
    pub planner: Value,
    pub model_spec: Value,
    pub expected_artifacts: Vec<String>,
    pub status: String,
    pub steps: Vec<PlanStep>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRun {
    pub id: String,
    pub task_plan_id: String,
    pub project_id: String,
    pub status: String,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolRun {
    pub id: String,
    pub workflow_run_id: String,
    pub tool_id: String,
    pub tool_version: String,
    pub input: Value,
    pub output: Value,
    pub status: String,
    pub log: String,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub project_id: String,
    pub task_plan_id: Option<String>,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub project: Project,
    pub overview: ProjectOverview,
    pub datasets: Vec<Dataset>,
    pub schemas: Vec<ResearchSchema>,
    pub materials: Vec<Material>,
    pub traits: Vec<TraitDefinition>,
    pub environments: Vec<Environment>,
    pub artifacts: Vec<Artifact>,
    pub task_plans: Vec<TaskPlan>,
    pub task_plan_runs: Vec<TaskPlanRun>,
    pub executions: Vec<Execution>,
    pub workflow_runs: Vec<WorkflowRun>,
    pub messages: Vec<Message>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactDetail {
    pub artifact: Artifact,
    pub upstream: Vec<Artifact>,
    pub dataset: Option<Dataset>,
    pub tool_runs: Vec<ToolRun>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LifecycleEvent {
    pub event_id: String,
    pub project_id: String,
    pub task_id: Option<String>,
    pub run_id: Option<String>,
    pub timestamp: String,
    pub event_type: String,
    pub payload: Value,
}
