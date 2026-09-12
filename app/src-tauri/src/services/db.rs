use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::path::Path;

use crate::domain::{Artifact, ArtifactFile, Dataset, Project, TaskPlan, ToolRun, WorkflowRun};
use crate::error::{AppError, AppResult};

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn open(path: &Path) -> AppResult<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| AppError::new("DB_DIRECTORY_FAILED", error.to_string()))?;
    }
    let connection = Connection::open(path)
        .map_err(|error| AppError::new("DB_OPEN_FAILED", error.to_string()))?;
    connection
        .execute_batch(
            "PRAGMA foreign_keys=ON;
             PRAGMA journal_mode=WAL;
             CREATE TABLE IF NOT EXISTS projects (
               id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL,
               created_at TEXT NOT NULL, updated_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS source_files (
               id TEXT PRIMARY KEY, project_id TEXT NOT NULL, original_name TEXT NOT NULL,
               managed_path TEXT NOT NULL, format TEXT NOT NULL, sha256 TEXT NOT NULL,
               size INTEGER NOT NULL, created_at TEXT NOT NULL,
               UNIQUE(project_id, sha256),
               FOREIGN KEY(project_id) REFERENCES projects(id)
             );
             CREATE TABLE IF NOT EXISTS datasets (
               id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL,
               dataset_type TEXT NOT NULL, version INTEGER NOT NULL,
               schema_json TEXT NOT NULL, source_json TEXT NOT NULL, metadata_json TEXT NOT NULL,
               quality_status TEXT NOT NULL, supersedes_id TEXT, canonical_path TEXT NOT NULL,
               created_at TEXT NOT NULL, FOREIGN KEY(project_id) REFERENCES projects(id)
             );
             CREATE TABLE IF NOT EXISTS artifacts (
               id TEXT PRIMARY KEY, project_id TEXT NOT NULL, dataset_id TEXT,
               artifact_type TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL,
               files_json TEXT NOT NULL, checksum TEXT NOT NULL, directory TEXT NOT NULL,
               produced_by_run_id TEXT, metadata_json TEXT NOT NULL, created_at TEXT NOT NULL,
               FOREIGN KEY(project_id) REFERENCES projects(id)
             );
             CREATE TABLE IF NOT EXISTS artifact_edges (
               artifact_id TEXT NOT NULL, upstream_id TEXT NOT NULL,
               PRIMARY KEY(artifact_id, upstream_id)
             );
             CREATE TABLE IF NOT EXISTS task_plans (
               id TEXT PRIMARY KEY, project_id TEXT NOT NULL, dataset_id TEXT NOT NULL,
               plan_json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS workflow_runs (
               id TEXT PRIMARY KEY, task_plan_id TEXT NOT NULL, project_id TEXT NOT NULL,
               status TEXT NOT NULL, error_code TEXT, error_message TEXT,
               started_at TEXT NOT NULL, finished_at TEXT
             );
             CREATE TABLE IF NOT EXISTS tool_runs (
               id TEXT PRIMARY KEY, workflow_run_id TEXT NOT NULL, tool_id TEXT NOT NULL,
               tool_version TEXT NOT NULL, input_json TEXT NOT NULL, output_json TEXT,
               status TEXT NOT NULL, log_text TEXT NOT NULL, started_at TEXT NOT NULL,
               finished_at TEXT
             );
             CREATE TABLE IF NOT EXISTS messages (
               id TEXT PRIMARY KEY, project_id TEXT NOT NULL, task_plan_id TEXT,
               role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_datasets_project ON datasets(project_id, created_at);
             CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id, created_at);
             CREATE INDEX IF NOT EXISTS idx_plans_project ON task_plans(project_id, created_at);
             CREATE INDEX IF NOT EXISTS idx_runs_project ON workflow_runs(project_id, started_at);",
        )
        .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
    Ok(connection)
}

fn parse_json(value: String) -> Value {
    serde_json::from_str(&value).unwrap_or(Value::Null)
}

pub fn ensure_draft_project(
    connection: &Connection,
    name_hint: Option<&str>,
) -> AppResult<Project> {
    if let Some(project) = connection
        .query_row(
            "SELECT id,name,status,created_at,updated_at FROM projects WHERE status='draft' ORDER BY created_at DESC LIMIT 1",
            [],
            |row| Ok(Project { id: row.get(0)?, name: row.get(1)?, status: row.get(2)?, created_at: row.get(3)?, updated_at: row.get(4)? }),
        )
        .optional()
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?
    {
        return Ok(project);
    }
    let timestamp = now();
    let project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name: name_hint
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("未命名育种项目")
            .trim()
            .to_string(),
        status: "draft".into(),
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    connection
        .execute(
            "INSERT INTO projects(id,name,status,created_at,updated_at) VALUES(?1,?2,?3,?4,?5)",
            params![
                project.id,
                project.name,
                project.status,
                project.created_at,
                project.updated_at
            ],
        )
        .map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok(project)
}

pub fn project(connection: &Connection, project_id: &str) -> AppResult<Project> {
    connection
        .query_row(
            "SELECT id,name,status,created_at,updated_at FROM projects WHERE id=?1",
            [project_id],
            |row| {
                Ok(Project {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    status: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            },
        )
        .map_err(|_| AppError::new("PROJECT_NOT_FOUND", "项目不存在"))
}

pub struct SourceRecord {
    pub id: String,
    pub original_name: String,
    pub managed_path: String,
    pub format: String,
    pub sha256: String,
    pub size: u64,
}

pub fn find_source(
    connection: &Connection,
    project_id: &str,
    checksum: &str,
) -> AppResult<Option<SourceRecord>> {
    connection.query_row(
        "SELECT id,original_name,managed_path,format,sha256,size FROM source_files WHERE project_id=?1 AND sha256=?2",
        params![project_id, checksum],
        |row| Ok(SourceRecord { id: row.get(0)?, original_name: row.get(1)?, managed_path: row.get(2)?, format: row.get(3)?, sha256: row.get(4)?, size: row.get::<_, i64>(5)? as u64 }),
    ).optional().map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))
}

pub fn insert_source(
    connection: &Connection,
    project_id: &str,
    record: &SourceRecord,
) -> AppResult<()> {
    connection.execute(
        "INSERT INTO source_files(id,project_id,original_name,managed_path,format,sha256,size,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
        params![record.id, project_id, record.original_name, record.managed_path, record.format, record.sha256, record.size as i64, now()],
    ).map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok(())
}

pub fn source(connection: &Connection, source_id: &str) -> AppResult<SourceRecord> {
    connection
        .query_row(
            "SELECT id,original_name,managed_path,format,sha256,size FROM source_files WHERE id=?1",
            [source_id],
            |row| {
                Ok(SourceRecord {
                    id: row.get(0)?,
                    original_name: row.get(1)?,
                    managed_path: row.get(2)?,
                    format: row.get(3)?,
                    sha256: row.get(4)?,
                    size: row.get::<_, i64>(5)? as u64,
                })
            },
        )
        .map_err(|_| AppError::new("SOURCE_NOT_FOUND", "数据源不存在"))
}

pub fn insert_dataset(
    connection: &Connection,
    dataset: &Dataset,
    canonical_path: &str,
) -> AppResult<()> {
    connection.execute(
        "INSERT INTO datasets(id,project_id,name,dataset_type,version,schema_json,source_json,metadata_json,quality_status,supersedes_id,canonical_path,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
        params![dataset.id,dataset.project_id,dataset.name,dataset.dataset_type,dataset.version,dataset.schema.to_string(),dataset.source.to_string(),dataset.metadata.to_string(),dataset.quality_status,dataset.supersedes_id,canonical_path,dataset.created_at],
    ).map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok(())
}

fn map_dataset(row: &rusqlite::Row<'_>) -> rusqlite::Result<Dataset> {
    Ok(Dataset {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        dataset_type: row.get(3)?,
        version: row.get(4)?,
        schema: parse_json(row.get(5)?),
        source: parse_json(row.get(6)?),
        metadata: parse_json(row.get(7)?),
        quality_status: row.get(8)?,
        supersedes_id: row.get(9)?,
        created_at: row.get(10)?,
    })
}

pub fn dataset(connection: &Connection, dataset_id: &str) -> AppResult<(Dataset, String)> {
    connection.query_row(
        "SELECT id,project_id,name,dataset_type,version,schema_json,source_json,metadata_json,quality_status,supersedes_id,created_at,canonical_path FROM datasets WHERE id=?1",
        [dataset_id],
        |row| Ok((map_dataset(row)?, row.get(11)?)),
    ).map_err(|_| AppError::new("DATASET_NOT_FOUND", "Dataset 不存在"))
}

pub fn datasets(connection: &Connection, project_id: &str) -> AppResult<Vec<Dataset>> {
    let mut statement = connection.prepare("SELECT id,project_id,name,dataset_type,version,schema_json,source_json,metadata_json,quality_status,supersedes_id,created_at FROM datasets WHERE project_id=?1 ORDER BY created_at DESC")
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    let rows = statement
        .query_map([project_id], map_dataset)
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))
}

pub fn insert_artifact(
    connection: &Connection,
    artifact: &Artifact,
    dataset_id: Option<&str>,
    directory: &str,
) -> AppResult<()> {
    connection.execute(
        "INSERT INTO artifacts(id,project_id,dataset_id,artifact_type,name,status,files_json,checksum,directory,produced_by_run_id,metadata_json,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
        params![artifact.id,artifact.project_id,dataset_id,artifact.artifact_type,artifact.name,artifact.status,serde_json::to_string(&artifact.files).unwrap_or_else(|_| "[]".into()),artifact.checksum,directory,artifact.produced_by_run_id,artifact.metadata.to_string(),artifact.created_at],
    ).map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    for upstream in &artifact.upstream_ids {
        connection
            .execute(
                "INSERT OR IGNORE INTO artifact_edges(artifact_id,upstream_id) VALUES(?1,?2)",
                params![artifact.id, upstream],
            )
            .map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    }
    Ok(())
}

fn map_artifact(connection: &Connection, row: &rusqlite::Row<'_>) -> rusqlite::Result<Artifact> {
    let id: String = row.get(0)?;
    let upstream = {
        let mut statement =
            connection.prepare("SELECT upstream_id FROM artifact_edges WHERE artifact_id=?1")?;
        let rows = statement
            .query_map([&id], |edge| edge.get(0))?
            .filter_map(Result::ok)
            .collect();
        rows
    };
    Ok(Artifact {
        id,
        project_id: row.get(1)?,
        artifact_type: row.get(2)?,
        name: row.get(3)?,
        status: row.get(4)?,
        files: serde_json::from_str::<Vec<ArtifactFile>>(&row.get::<_, String>(5)?)
            .unwrap_or_default(),
        checksum: row.get(6)?,
        upstream_ids: upstream,
        produced_by_run_id: row.get(7)?,
        metadata: parse_json(row.get(8)?),
        created_at: row.get(9)?,
    })
}

pub fn artifacts(connection: &Connection, project_id: &str) -> AppResult<Vec<Artifact>> {
    let mut statement = connection.prepare("SELECT id,project_id,artifact_type,name,status,files_json,checksum,produced_by_run_id,metadata_json,created_at FROM artifacts WHERE project_id=?1 ORDER BY created_at DESC")
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    let rows = statement
        .query_map([project_id], |row| map_artifact(connection, row))
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))
}

pub fn artifact(
    connection: &Connection,
    artifact_id: &str,
) -> AppResult<(Artifact, Option<String>)> {
    connection.query_row(
        "SELECT id,project_id,artifact_type,name,status,files_json,checksum,produced_by_run_id,metadata_json,created_at,dataset_id FROM artifacts WHERE id=?1",
        [artifact_id],
        |row| Ok((map_artifact(connection, row)?, row.get(10)?)),
    ).map_err(|_| AppError::new("ARTIFACT_NOT_FOUND", "Artifact 不存在"))
}

pub fn insert_plan(connection: &Connection, plan: &TaskPlan) -> AppResult<()> {
    connection.execute("INSERT INTO task_plans(id,project_id,dataset_id,plan_json,status,created_at) VALUES(?1,?2,?3,?4,?5,?6)", params![plan.id,plan.project_id,plan.dataset_id,serde_json::to_string(plan).unwrap_or_else(|_| "{}".into()),plan.status,plan.created_at])
        .map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok(())
}

pub fn plan(connection: &Connection, plan_id: &str) -> AppResult<TaskPlan> {
    let value: String = connection
        .query_row(
            "SELECT plan_json FROM task_plans WHERE id=?1",
            [plan_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::new("TASK_PLAN_NOT_FOUND", "任务计划不存在"))?;
    serde_json::from_str(&value)
        .map_err(|error| AppError::new("TASK_PLAN_INVALID", error.to_string()))
}

pub fn plans(connection: &Connection, project_id: &str) -> AppResult<Vec<TaskPlan>> {
    let mut statement = connection
        .prepare("SELECT plan_json FROM task_plans WHERE project_id=?1 ORDER BY created_at DESC")
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    let rows = statement
        .query_map([project_id], |row| row.get::<_, String>(0))
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    Ok(rows
        .filter_map(Result::ok)
        .filter_map(|value| serde_json::from_str(&value).ok())
        .collect())
}

pub fn update_plan_status(connection: &Connection, plan_id: &str, status: &str) -> AppResult<()> {
    let mut plan = plan(connection, plan_id)?;
    plan.status = status.into();
    connection
        .execute(
            "UPDATE task_plans SET status=?1, plan_json=?2 WHERE id=?3",
            params![
                status,
                serde_json::to_string(&plan).unwrap_or_default(),
                plan_id
            ],
        )
        .map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok(())
}

pub fn insert_run(connection: &Connection, run: &WorkflowRun) -> AppResult<()> {
    connection.execute("INSERT INTO workflow_runs(id,task_plan_id,project_id,status,error_code,error_message,started_at,finished_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)", params![run.id,run.task_plan_id,run.project_id,run.status,run.error_code,run.error_message,run.started_at,run.finished_at])
        .map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok(())
}

pub fn update_run(
    connection: &Connection,
    run_id: &str,
    status: &str,
    error: Option<&AppError>,
) -> AppResult<()> {
    connection.execute("UPDATE workflow_runs SET status=?1,error_code=?2,error_message=?3,finished_at=?4 WHERE id=?5", params![status,error.map(|item| item.code.as_str()),error.map(|item| item.message.as_str()),now(),run_id])
        .map_err(|item| AppError::new("DB_WRITE_FAILED", item.to_string()))?;
    Ok(())
}

pub fn runs(connection: &Connection, project_id: &str) -> AppResult<Vec<WorkflowRun>> {
    let mut statement = connection.prepare("SELECT id,task_plan_id,project_id,status,error_code,error_message,started_at,finished_at FROM workflow_runs WHERE project_id=?1 ORDER BY started_at DESC").map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    let rows = statement
        .query_map([project_id], |row| {
            Ok(WorkflowRun {
                id: row.get(0)?,
                task_plan_id: row.get(1)?,
                project_id: row.get(2)?,
                status: row.get(3)?,
                error_code: row.get(4)?,
                error_message: row.get(5)?,
                started_at: row.get(6)?,
                finished_at: row.get(7)?,
            })
        })
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))
}

pub fn start_tool_run(
    connection: &Connection,
    run_id: &str,
    tool_id: &str,
    tool_version: &str,
    input: Value,
) -> AppResult<String> {
    let id = uuid::Uuid::new_v4().to_string();
    connection.execute("INSERT INTO tool_runs(id,workflow_run_id,tool_id,tool_version,input_json,status,log_text,started_at) VALUES(?1,?2,?3,?4,?5,'running','',?6)", params![id,run_id,tool_id,tool_version,input.to_string(),now()])
        .map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok(id)
}

pub fn tool_runs(connection: &Connection, workflow_run_id: &str) -> AppResult<Vec<ToolRun>> {
    let mut statement = connection.prepare(
        "SELECT id,workflow_run_id,tool_id,tool_version,input_json,output_json,status,log_text,started_at,finished_at FROM tool_runs WHERE workflow_run_id=?1 ORDER BY started_at"
    ).map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    let rows = statement
        .query_map([workflow_run_id], |row| {
            Ok(ToolRun {
                id: row.get(0)?,
                workflow_run_id: row.get(1)?,
                tool_id: row.get(2)?,
                tool_version: row.get(3)?,
                input: parse_json(row.get(4)?),
                output: parse_json(
                    row.get::<_, Option<String>>(5)?
                        .unwrap_or_else(|| "null".into()),
                ),
                status: row.get(6)?,
                log: row.get(7)?,
                started_at: row.get(8)?,
                finished_at: row.get(9)?,
            })
        })
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))
}

pub fn finish_tool_run(
    connection: &Connection,
    id: &str,
    status: &str,
    output: Value,
    log: &str,
) -> AppResult<()> {
    connection
        .execute(
            "UPDATE tool_runs SET status=?1,output_json=?2,log_text=?3,finished_at=?4 WHERE id=?5",
            params![status, output.to_string(), log, now(), id],
        )
        .map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok(())
}

pub fn source_json(source: &SourceRecord) -> Value {
    json!({"sourceId":source.id,"name":source.original_name,"format":source.format,"checksum":source.sha256,"size":source.size})
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_and_dataset_survive_reopen() {
        let path = std::env::temp_dir().join(format!("lian-{}.db", uuid::Uuid::new_v4()));
        {
            let connection = open(&path).unwrap();
            let project = ensure_draft_project(&connection, Some("测试项目")).unwrap();
            assert_eq!(project.name, "测试项目");
        }
        let connection = open(&path).unwrap();
        assert_eq!(
            ensure_draft_project(&connection, None).unwrap().name,
            "测试项目"
        );
        let _ = std::fs::remove_file(path);
    }
}
