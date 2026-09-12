use serde::{Deserialize, Serialize};
use serde_json::Value;

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportInspection {
    pub project_id: String,
    pub candidates: Vec<SourceCandidate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanStep {
    pub id: String,
    pub tool_id: String,
    pub title: String,
    pub status: String,
    pub risk_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPlan {
    pub id: String,
    pub project_id: String,
    pub dataset_id: String,
    pub title: String,
    pub intent: String,
    pub trait_id: String,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub project: Project,
    pub datasets: Vec<Dataset>,
    pub artifacts: Vec<Artifact>,
    pub task_plans: Vec<TaskPlan>,
    pub workflow_runs: Vec<WorkflowRun>,
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
