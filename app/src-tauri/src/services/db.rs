use rusqlite::{params, Connection, DatabaseName, OptionalExtension};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;

use crate::domain::{
    Artifact, ArtifactFile, Conversation, Dataset, Message, Project, TaskPlan, ToolRun, WorkflowRun,
};
use crate::error::{AppError, AppResult};

const SCHEMA_VERSION: i64 = 4;

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
    let current_version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
    if current_version > SCHEMA_VERSION {
        return Err(AppError::new(
            "DB_VERSION_UNSUPPORTED",
            "数据库版本高于当前应用支持范围",
        ));
    }
    if current_version == 1 {
        let backup_path = path.with_extension(format!(
            "pre-v2-{}.db",
            chrono::Utc::now().format("%Y%m%d%H%M%S")
        ));
        connection
            .backup(DatabaseName::Main, &backup_path, None)
            .map_err(|error| AppError::new("DB_BACKUP_FAILED", error.to_string()))?;
    }
    if current_version == 2 {
        let backup_path = path.with_extension(format!(
            "pre-v3-{}",
            chrono::Utc::now().format("%Y%m%d%H%M%S")
        ));
        connection
            .backup(DatabaseName::Main, &backup_path, None)
            .map_err(|error| AppError::new("DB_BACKUP_FAILED", error.to_string()))?;
    }
    if current_version == 3 {
        let backup_path = path.with_extension(format!(
            "pre-v4-{}",
            chrono::Utc::now().format("%Y%m%d%H%M%S")
        ));
        connection
            .backup(DatabaseName::Main, &backup_path, None)
            .map_err(|error| AppError::new("DB_BACKUP_FAILED", error.to_string()))?;
    }
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
             CREATE TABLE IF NOT EXISTS research_datasets (
               id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL,
               dataset_type TEXT NOT NULL, current_version_id TEXT,
               created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
               UNIQUE(project_id, name, dataset_type),
               FOREIGN KEY(project_id) REFERENCES projects(id)
             );
             CREATE TABLE IF NOT EXISTS research_schemas (
               id TEXT PRIMARY KEY, project_id TEXT NOT NULL, dataset_type TEXT NOT NULL,
               version INTEGER NOT NULL, layout TEXT NOT NULL, fields_json TEXT NOT NULL,
               roles_json TEXT NOT NULL, checksum TEXT NOT NULL, created_at TEXT NOT NULL,
               UNIQUE(project_id, checksum), FOREIGN KEY(project_id) REFERENCES projects(id)
             );
             CREATE TABLE IF NOT EXISTS dataset_versions (
               id TEXT PRIMARY KEY, dataset_id TEXT NOT NULL, project_id TEXT NOT NULL,
               version INTEGER NOT NULL, source_file_id TEXT NOT NULL, schema_id TEXT NOT NULL,
               canonical_path TEXT NOT NULL, canonical_checksum TEXT NOT NULL,
               quality_status TEXT NOT NULL, supersedes_version_id TEXT,
               metadata_json TEXT NOT NULL, created_at TEXT NOT NULL,
               UNIQUE(dataset_id, version), FOREIGN KEY(dataset_id) REFERENCES research_datasets(id),
               FOREIGN KEY(project_id) REFERENCES projects(id),
               FOREIGN KEY(source_file_id) REFERENCES source_files(id),
               FOREIGN KEY(schema_id) REFERENCES research_schemas(id)
             );
             CREATE TABLE IF NOT EXISTS materials (
               id TEXT PRIMARY KEY, project_id TEXT NOT NULL, canonical_code TEXT NOT NULL,
               exact_key TEXT NOT NULL, display_name TEXT NOT NULL, origin TEXT, generation TEXT,
               metadata_json TEXT NOT NULL, created_at TEXT NOT NULL,
               UNIQUE(project_id, exact_key), FOREIGN KEY(project_id) REFERENCES projects(id)
             );
             CREATE TABLE IF NOT EXISTS material_aliases (
               id TEXT PRIMARY KEY, project_id TEXT NOT NULL, material_id TEXT NOT NULL,
               alias TEXT NOT NULL, exact_key TEXT NOT NULL, decision_id TEXT,
               created_at TEXT NOT NULL, UNIQUE(project_id, exact_key),
               FOREIGN KEY(material_id) REFERENCES materials(id)
             );
             CREATE TABLE IF NOT EXISTS traits (
               id TEXT PRIMARY KEY, project_id TEXT NOT NULL, canonical_code TEXT NOT NULL,
               name TEXT NOT NULL, value_type TEXT NOT NULL, unit TEXT, method TEXT, scale TEXT,
               ontology_ref TEXT, created_at TEXT NOT NULL,
               UNIQUE(project_id, canonical_code, unit, method, scale),
               FOREIGN KEY(project_id) REFERENCES projects(id)
             );
             CREATE TABLE IF NOT EXISTS environments (
               id TEXT PRIMARY KEY, project_id TEXT NOT NULL, canonical_code TEXT NOT NULL,
               name TEXT NOT NULL, location TEXT, year INTEGER, season TEXT,
               treatment_json TEXT NOT NULL, metadata_json TEXT NOT NULL, created_at TEXT NOT NULL,
               UNIQUE(project_id, canonical_code), FOREIGN KEY(project_id) REFERENCES projects(id)
             );
             CREATE TABLE IF NOT EXISTS dataset_materials (
               dataset_version_id TEXT NOT NULL, material_id TEXT NOT NULL, source_label TEXT NOT NULL,
               resolution TEXT NOT NULL, decision_id TEXT, PRIMARY KEY(dataset_version_id, material_id, source_label)
             );
             CREATE TABLE IF NOT EXISTS dataset_traits (
               dataset_version_id TEXT NOT NULL, trait_id TEXT NOT NULL, source_label TEXT NOT NULL,
               PRIMARY KEY(dataset_version_id, trait_id, source_label)
             );
             CREATE TABLE IF NOT EXISTS dataset_environments (
               dataset_version_id TEXT NOT NULL, environment_id TEXT NOT NULL, source_label TEXT NOT NULL,
               PRIMARY KEY(dataset_version_id, environment_id, source_label)
             );
             CREATE TABLE IF NOT EXISTS identity_decisions (
               id TEXT PRIMARY KEY, project_id TEXT NOT NULL, entity_kind TEXT NOT NULL,
               source_value TEXT NOT NULL, decision TEXT NOT NULL, target_id TEXT,
               reason TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS import_sessions (
               id TEXT PRIMARY KEY, project_id TEXT NOT NULL, inspection_json TEXT NOT NULL,
               status TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT
             );
             CREATE TABLE IF NOT EXISTS task_plan_runs (
               id TEXT PRIMARY KEY, task_plan_id TEXT NOT NULL, project_id TEXT NOT NULL,
               status TEXT NOT NULL, error_code TEXT, error_message TEXT,
               started_at TEXT NOT NULL, finished_at TEXT
             );
             CREATE TABLE IF NOT EXISTS executions (
               id TEXT PRIMARY KEY, task_plan_run_id TEXT NOT NULL, project_id TEXT NOT NULL,
               step_id TEXT NOT NULL, tool_id TEXT NOT NULL, tool_version TEXT NOT NULL,
               inputs_json TEXT NOT NULL, parameters_json TEXT NOT NULL, runtime_json TEXT NOT NULL,
               status TEXT NOT NULL, fingerprint TEXT NOT NULL, exit_code INTEGER,
               error_code TEXT, error_message TEXT, stdout_json TEXT, stderr_json TEXT,
               logs_truncated INTEGER NOT NULL DEFAULT 0, started_at TEXT NOT NULL, finished_at TEXT
             );
             CREATE TABLE IF NOT EXISTS research_nodes (
               id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL,
               entity_id TEXT NOT NULL, label TEXT NOT NULL, metadata_json TEXT NOT NULL,
               created_at TEXT NOT NULL, UNIQUE(project_id, kind, entity_id)
             );
             CREATE TABLE IF NOT EXISTS lineage_edges (
               id TEXT PRIMARY KEY, project_id TEXT NOT NULL, upstream_node_id TEXT NOT NULL,
               downstream_node_id TEXT NOT NULL, relation TEXT NOT NULL, created_at TEXT NOT NULL,
               UNIQUE(project_id, upstream_node_id, downstream_node_id, relation),
               FOREIGN KEY(upstream_node_id) REFERENCES research_nodes(id),
               FOREIGN KEY(downstream_node_id) REFERENCES research_nodes(id)
             );
             CREATE INDEX IF NOT EXISTS idx_datasets_project ON datasets(project_id, created_at);
             CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id, created_at);
             CREATE INDEX IF NOT EXISTS idx_plans_project ON task_plans(project_id, created_at);
             CREATE INDEX IF NOT EXISTS idx_runs_project ON workflow_runs(project_id, started_at);
             CREATE INDEX IF NOT EXISTS idx_materials_project ON materials(project_id, canonical_code);
             CREATE INDEX IF NOT EXISTS idx_versions_project ON dataset_versions(project_id, created_at);
             CREATE INDEX IF NOT EXISTS idx_executions_project ON executions(project_id, started_at);
             CREATE INDEX IF NOT EXISTS idx_lineage_upstream ON lineage_edges(upstream_node_id);
             CREATE INDEX IF NOT EXISTS idx_lineage_downstream ON lineage_edges(downstream_node_id);",
        )
        .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
    if current_version < 2 {
        migrate_v1(&connection)?;
    }
    if current_version < 3 {
        migrate_conversations_v1(&connection)?;
    }
    if current_version < 4 {
        migrate_message_reasoning_v1(&connection)?;
    }
    connection
        .pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
    Ok(connection)
}

fn migrate_v1(connection: &Connection) -> AppResult<()> {
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
    transaction.execute_batch(
        "UPDATE projects SET status='active' WHERE status='draft';
         INSERT OR IGNORE INTO task_plan_runs(id,task_plan_id,project_id,status,error_code,error_message,started_at,finished_at)
           SELECT id,task_plan_id,project_id,CASE status WHEN 'succeeded' THEN 'completed' ELSE status END,error_code,error_message,started_at,finished_at FROM workflow_runs;
         INSERT OR IGNORE INTO executions(id,task_plan_run_id,project_id,step_id,tool_id,tool_version,inputs_json,parameters_json,runtime_json,status,fingerprint,exit_code,error_code,error_message,started_at,finished_at)
           SELECT tr.id,tr.workflow_run_id,wr.project_id,tr.tool_id,tr.tool_id,tr.tool_version,tr.input_json,'{}','{\"provenanceStatus\":\"legacy\"}',
             CASE tr.status WHEN 'succeeded' THEN 'completed' ELSE tr.status END,lower(hex(tr.input_json || tr.tool_id || tr.tool_version)),NULL,NULL,NULL,tr.started_at,tr.finished_at
           FROM tool_runs tr JOIN workflow_runs wr ON wr.id=tr.workflow_run_id;"
    ).map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
    migrate_datasets_v1(&transaction)?;
    migrate_lineage_v1(&transaction)?;
    transaction
        .commit()
        .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
    Ok(())
}

fn migrate_lineage_v1(connection: &Connection) -> AppResult<()> {
    connection.execute_batch(
        "INSERT OR IGNORE INTO research_nodes(id,project_id,kind,entity_id,label,metadata_json,created_at)
           SELECT 'sourceFile:'||id,project_id,'sourceFile',id,original_name,json_object('checksum',sha256),created_at FROM source_files;
         INSERT OR IGNORE INTO research_nodes(id,project_id,kind,entity_id,label,metadata_json,created_at)
           SELECT 'datasetVersion:'||v.id,v.project_id,'datasetVersion',v.id,d.name||' v'||v.version,json_object('checksum',v.canonical_checksum),v.created_at FROM dataset_versions v JOIN research_datasets d ON d.id=v.dataset_id;
         INSERT OR IGNORE INTO research_nodes(id,project_id,kind,entity_id,label,metadata_json,created_at)
           SELECT 'execution:'||id,project_id,'execution',id,tool_id,json_object('toolVersion',tool_version,'partialProvenance',1),started_at FROM executions;
         INSERT OR IGNORE INTO research_nodes(id,project_id,kind,entity_id,label,metadata_json,created_at)
           SELECT 'artifact:'||id,project_id,'artifact',id,name,json_object('checksum',checksum),created_at FROM artifacts;
         INSERT OR IGNORE INTO lineage_edges(id,project_id,upstream_node_id,downstream_node_id,relation,created_at)
           SELECT lower(hex(randomblob(16))),v.project_id,'sourceFile:'||v.source_file_id,'datasetVersion:'||v.id,'input_to',v.created_at FROM dataset_versions v;
         INSERT OR IGNORE INTO lineage_edges(id,project_id,upstream_node_id,downstream_node_id,relation,created_at)
           SELECT lower(hex(randomblob(16))),a.project_id,'datasetVersion:'||a.dataset_id,'artifact:'||a.id,'legacy_input_to',a.created_at FROM artifacts a JOIN dataset_versions v ON v.id=a.dataset_id;
         INSERT OR IGNORE INTO lineage_edges(id,project_id,upstream_node_id,downstream_node_id,relation,created_at)
           SELECT lower(hex(randomblob(16))),a.project_id,'artifact:'||e.upstream_id,'artifact:'||e.artifact_id,'derived_to',a.created_at FROM artifact_edges e JOIN artifacts a ON a.id=e.artifact_id JOIN artifacts u ON u.id=e.upstream_id AND u.project_id=a.project_id;
         INSERT OR IGNORE INTO lineage_edges(id,project_id,upstream_node_id,downstream_node_id,relation,created_at)
           SELECT lower(hex(randomblob(16))),a.project_id,'execution:'||x.id,'artifact:'||a.id,'produced',a.created_at FROM artifacts a JOIN executions x ON x.task_plan_run_id=a.produced_by_run_id WHERE (SELECT count(*) FROM executions e WHERE e.task_plan_run_id=a.produced_by_run_id)=1;
         UPDATE artifacts SET metadata_json=json_set(metadata_json,'$.partialProvenance',1)
           WHERE produced_by_run_id IS NULL OR (SELECT count(*) FROM executions e WHERE e.task_plan_run_id=artifacts.produced_by_run_id)<>1;"
    ).map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
    Ok(())
}

/// v2→v3：对话成为交互单元。消息从直挂 Project 改为挂 Conversation，
/// 历史 Project 消息各建一个「研究对话」会话承接；Conversation 的 project_id 允许为空（临时会话）。
fn migrate_conversations_v1(connection: &Connection) -> AppResult<()> {
    // 仅当 messages 仍是旧结构（直挂 project_id）时才搬迁；
    // 兼容「新结构库被回拨版本号」的测试与异常形态，避免重复迁移报错。
    let legacy_layout = connection
        .prepare("PRAGMA table_info(messages)")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| row.get::<_, String>(1))
                .map(|rows| {
                    rows.filter_map(Result::ok)
                        .any(|column| column == "project_id")
                })
        })
        .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS conversations (
               id TEXT PRIMARY KEY, project_id TEXT, title TEXT NOT NULL,
               status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
               FOREIGN KEY(project_id) REFERENCES projects(id)
             );",
        )
        .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
    if !legacy_layout {
        connection
            .execute_batch(
                "CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);",
            )
            .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
        return Ok(());
    }
    connection
        .execute_batch(
            "INSERT INTO conversations(id,project_id,title,status,created_at,updated_at)
               SELECT 'conv:project:'||m.project_id, m.project_id, p.name, 'active', MIN(m.created_at), MAX(m.created_at)
               FROM messages m JOIN projects p ON p.id=m.project_id GROUP BY m.project_id, p.name;
             CREATE TABLE messages_v3 (
               id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, task_plan_id TEXT,
               role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL,
               FOREIGN KEY(conversation_id) REFERENCES conversations(id)
             );
             INSERT INTO messages_v3(id,conversation_id,task_plan_id,role,content,created_at)
               SELECT id,'conv:project:'||project_id,task_plan_id,role,content,created_at FROM messages;
             DROP TABLE messages;
             ALTER TABLE messages_v3 RENAME TO messages;
             CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);",
        )
        .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
    Ok(())
}

/// v3→v4：保留模型实际返回的思考文本；旧消息一律为 NULL。
fn migrate_message_reasoning_v1(connection: &Connection) -> AppResult<()> {
    let has_reasoning = connection
        .prepare("PRAGMA table_info(messages)")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| row.get::<_, String>(1))
                .map(|rows| {
                    rows.filter_map(Result::ok)
                        .any(|column| column == "reasoning")
                })
        })
        .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
    if has_reasoning {
        return Ok(());
    }
    connection
        .execute_batch("ALTER TABLE messages ADD COLUMN reasoning TEXT;")
        .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))
}

#[derive(Clone)]
struct LegacyDataset {
    id: String,
    project_id: String,
    name: String,
    dataset_type: String,
    version: i64,
    schema: String,
    source: Value,
    metadata: String,
    quality: String,
    supersedes: Option<String>,
    canonical_path: String,
    created_at: String,
}

fn migrate_datasets_v1(connection: &Connection) -> AppResult<()> {
    let mut statement = connection.prepare("SELECT id,project_id,name,dataset_type,version,schema_json,source_json,metadata_json,quality_status,supersedes_id,canonical_path,created_at FROM datasets ORDER BY created_at,id")
        .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
    let rows = statement
        .query_map([], |row| {
            Ok(LegacyDataset {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                dataset_type: row.get(3)?,
                version: row.get(4)?,
                schema: row.get(5)?,
                source: parse_json(row.get(6)?),
                metadata: row.get(7)?,
                quality: row.get(8)?,
                supersedes: row.get(9)?,
                canonical_path: row.get(10)?,
                created_at: row.get(11)?,
            })
        })
        .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
    let datasets = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
    let index = datasets
        .iter()
        .map(|item| (item.id.clone(), item.clone()))
        .collect::<HashMap<_, _>>();
    for item in &datasets {
        let mut root = item;
        while let Some(parent) = root.supersedes.as_ref().and_then(|id| index.get(id)) {
            root = parent;
        }
        connection.execute("INSERT OR IGNORE INTO research_datasets(id,project_id,name,dataset_type,current_version_id,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?6)", params![root.id,item.project_id,item.name,item.dataset_type,item.id,item.created_at])
            .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
        connection.execute("UPDATE research_datasets SET current_version_id=?1,updated_at=?2 WHERE id=?3 AND COALESCE((SELECT version FROM dataset_versions WHERE id=current_version_id),-1)<?4", params![item.id,item.created_at,root.id,item.version])
            .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
        let mut hasher = sha2::Sha256::new();
        use sha2::Digest;
        hasher.update(item.schema.as_bytes());
        let schema_checksum = hex::encode(hasher.finalize());
        let schema_id = connection
            .query_row(
                "SELECT id FROM research_schemas WHERE project_id=?1 AND checksum=?2",
                params![item.project_id, schema_checksum],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let schema_value = parse_json(item.schema.clone());
        connection.execute("INSERT OR IGNORE INTO research_schemas(id,project_id,dataset_type,version,layout,fields_json,roles_json,checksum,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)", params![schema_id,item.project_id,item.dataset_type,item.version,schema_value["layout"].as_str().unwrap_or("long"),item.schema,schema_value["roles"].to_string(),schema_checksum,item.created_at])
            .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
        let source_id = item.source["sourceId"]
            .as_str()
            .map(str::to_owned)
            .or_else(|| {
                connection
                    .query_row(
                        "SELECT id FROM source_files WHERE project_id=?1 AND sha256=?2",
                        params![
                            item.project_id,
                            item.source["checksum"].as_str().unwrap_or_default()
                        ],
                        |row| row.get(0),
                    )
                    .optional()
                    .ok()
                    .flatten()
            });
        if let Some(source_id) = source_id {
            connection.execute("INSERT OR IGNORE INTO dataset_versions(id,dataset_id,project_id,version,source_file_id,schema_id,canonical_path,canonical_checksum,quality_status,supersedes_version_id,metadata_json,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)", params![item.id,root.id,item.project_id,item.version,source_id,schema_id,item.canonical_path,item.source["checksum"].as_str().unwrap_or("legacy-unknown"),item.quality,item.supersedes,item.metadata,item.created_at])
                .map_err(|error| AppError::new("DB_MIGRATION_FAILED", error.to_string()))?;
        }
    }
    Ok(())
}

pub fn recover_interrupted_runs(connection: &Connection) -> AppResult<()> {
    connection.execute(
        "UPDATE workflow_runs SET status='interrupted',error_code='PROCESS_INTERRUPTED',error_message='应用退出时任务仍在运行',finished_at=?1 WHERE status='running'",
        [now()],
    ).map_err(|error| AppError::new("DB_RECOVERY_FAILED", error.to_string()))?;
    connection.execute(
        "UPDATE task_plan_runs SET status='interrupted',error_code='PROCESS_INTERRUPTED',error_message='应用退出时任务仍在运行',finished_at=?1 WHERE status='running'",
        [now()],
    ).map_err(|error| AppError::new("DB_RECOVERY_FAILED", error.to_string()))?;
    connection.execute(
        "UPDATE executions SET status='interrupted',error_code='PROCESS_INTERRUPTED',error_message='应用退出时工具仍在运行',finished_at=?1 WHERE status='running'",
        [now()],
    ).map_err(|error| AppError::new("DB_RECOVERY_FAILED", error.to_string()))?;
    connection.execute(
        "UPDATE task_plans SET status='interrupted',plan_json=json_set(plan_json,'$.status','interrupted') WHERE status='running'",
        [],
    ).map_err(|error| AppError::new("DB_RECOVERY_FAILED", error.to_string()))?;
    Ok(())
}

fn parse_json(value: String) -> Value {
    serde_json::from_str(&value).unwrap_or(Value::Null)
}

pub fn ensure_draft_project(
    connection: &Connection,
    name_hint: Option<&str>,
) -> AppResult<Project> {
    if let Some(mut project) = connection
        .query_row(
            "SELECT id,name,status,created_at,updated_at FROM projects WHERE status IN ('active','draft') ORDER BY updated_at DESC LIMIT 1",
            [],
            |row| Ok(Project { id: row.get(0)?, name: row.get(1)?, status: row.get(2)?, created_at: row.get(3)?, updated_at: row.get(4)? }),
        )
        .optional()
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?
    {
        if project.name == "未命名育种项目" {
            if let Some(name) = name_hint.filter(|value| !value.trim().is_empty()) {
                project.name = name.trim().to_string();
                project.updated_at = now();
                connection.execute(
                    "UPDATE projects SET name=?1,updated_at=?2 WHERE id=?3",
                    params![project.name, project.updated_at, project.id],
                ).map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
            }
        }
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
        status: "active".into(),
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
    let artifact_node = crate::services::research::add_node(
        connection,
        &artifact.project_id,
        "artifact",
        &artifact.id,
        &artifact.name,
        json!({"artifactType":artifact.artifact_type,"checksum":artifact.checksum}),
    )?;
    if let Some(run_id) = &artifact.produced_by_run_id {
        let execution_id: Option<String> = connection
            .query_row(
                "SELECT id FROM executions WHERE task_plan_run_id=?1 ORDER BY started_at LIMIT 1",
                [run_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
        if let Some(execution_id) = execution_id {
            let execution_node = crate::services::research::add_node(
                connection,
                &artifact.project_id,
                "execution",
                &execution_id,
                "工具执行",
                json!({}),
            )?;
            crate::services::research::add_edge(
                connection,
                &artifact.project_id,
                &execution_node,
                &artifact_node,
                "produced",
            )?;
        }
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
    connection.execute("INSERT INTO task_plan_runs(id,task_plan_id,project_id,status,started_at,finished_at) VALUES(?1,?2,?3,?4,?5,?6)", params![run.id,run.task_plan_id,run.project_id,run.status,run.started_at,run.finished_at])
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
    let m2_status = if status == "succeeded" {
        "completed"
    } else {
        status
    };
    connection.execute("UPDATE task_plan_runs SET status=?1,error_code=?2,error_message=?3,finished_at=?4 WHERE id=?5", params![m2_status,error.map(|item| item.code.as_str()),error.map(|item| item.message.as_str()),now(),run_id])
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
    let project_id: String = connection
        .query_row(
            "SELECT project_id FROM task_plan_runs WHERE id=?1",
            [run_id],
            |row| row.get(0),
        )
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    let fingerprint = {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(tool_id.as_bytes());
        hasher.update(tool_version.as_bytes());
        hasher.update(input.to_string().as_bytes());
        if let Some(dataset_id) = input["datasetId"].as_str() {
            if let Ok((checksum, schema_id)) = connection.query_row(
                "SELECT canonical_checksum,schema_id FROM dataset_versions WHERE id=?1",
                [dataset_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            ) {
                hasher.update(checksum.as_bytes());
                hasher.update(schema_id.as_bytes());
            }
        }
        hex::encode(hasher.finalize())
    };
    let parameters = input.get("modelSpec").cloned().unwrap_or_else(|| json!({}));
    connection.execute("INSERT INTO executions(id,task_plan_run_id,project_id,step_id,tool_id,tool_version,inputs_json,parameters_json,runtime_json,status,fingerprint,started_at) VALUES(?1,?2,?3,?4,?4,?5,?6,?7,?8,'running',?9,?10)", params![id,run_id,project_id,tool_id,tool_version,input.to_string(),parameters.to_string(),json!({"runtime":"python","status":"captured_by_m2"}).to_string(),fingerprint,now()])
        .map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    let execution_node = crate::services::research::add_node(
        connection,
        &project_id,
        "execution",
        &id,
        tool_id,
        json!({"toolVersion":tool_version,"fingerprint":fingerprint}),
    )?;
    if let Some(dataset_id) = input["datasetId"].as_str() {
        let dataset_node = crate::services::research::add_node(
            connection,
            &project_id,
            "datasetVersion",
            dataset_id,
            "Dataset 输入",
            json!({}),
        )?;
        crate::services::research::add_edge(
            connection,
            &project_id,
            &dataset_node,
            &execution_node,
            "input_to",
        )?;
    }
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
    let m2_status = if status == "succeeded" {
        "completed"
    } else {
        status
    };
    connection.execute("UPDATE executions SET status=?1,runtime_json=json_set(runtime_json,'$.output',json(?2)),error_code=?3,error_message=?4,exit_code=?5,finished_at=?6 WHERE id=?7", params![m2_status,output.to_string(),if status=="failed"{output["errorCode"].as_str()}else{None},if status=="failed"{Some(log)}else{None},if status=="succeeded"{Some(0)}else{Some(1)},now(),id])
        .map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok(())
}

pub fn attach_execution_logs(
    connection: &Connection,
    execution_id: &str,
    stdout: &ArtifactFile,
    stderr: &ArtifactFile,
    truncated: bool,
) -> AppResult<()> {
    connection
        .execute(
            "UPDATE executions SET stdout_json=?1,stderr_json=?2,logs_truncated=?3 WHERE id=?4",
            params![
                serde_json::to_string(stdout).unwrap_or_default(),
                serde_json::to_string(stderr).unwrap_or_default(),
                truncated as i64,
                execution_id
            ],
        )
        .map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok(())
}

pub fn insert_message(
    connection: &Connection,
    conversation_id: &str,
    task_plan_id: Option<&str>,
    role: &str,
    content: &str,
    reasoning: Option<&str>,
) -> AppResult<()> {
    connection.execute(
        "INSERT INTO messages(id,conversation_id,task_plan_id,role,content,reasoning,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7)",
        params![uuid::Uuid::new_v4().to_string(),conversation_id,task_plan_id,role,content,reasoning,now()],
    ).map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    touch_conversation(connection, conversation_id)?;
    Ok(())
}

fn map_message(row: &rusqlite::Row<'_>) -> rusqlite::Result<Message> {
    Ok(Message {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        task_plan_id: row.get(2)?,
        role: row.get(3)?,
        content: row.get(4)?,
        reasoning: row.get(5)?,
        created_at: row.get(6)?,
    })
}

/// 当前会话的消息时间线。
pub fn conversation_messages(
    connection: &Connection,
    conversation_id: &str,
) -> AppResult<Vec<Message>> {
    let mut statement = connection.prepare(
        "SELECT id,conversation_id,task_plan_id,role,content,reasoning,created_at FROM messages WHERE conversation_id=?1 ORDER BY created_at",
    )
    .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    let rows = statement
        .query_map([conversation_id], map_message)
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))
}

/// 项目内全部会话的消息（兼容旧 project 维度快照）。
pub fn messages(connection: &Connection, project_id: &str) -> AppResult<Vec<Message>> {
    let mut statement = connection
        .prepare(
            "SELECT m.id,m.conversation_id,m.task_plan_id,m.role,m.content,m.reasoning,m.created_at
         FROM messages m JOIN conversations c ON c.id=m.conversation_id
         WHERE c.project_id=?1 ORDER BY m.created_at",
        )
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    let rows = statement
        .query_map([project_id], map_message)
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))
}

fn map_conversation(row: &rusqlite::Row<'_>) -> rusqlite::Result<Conversation> {
    Ok(Conversation {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        status: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

const CONVERSATION_COLUMNS: &str = "id,project_id,title,status,created_at,updated_at";

pub fn insert_conversation(connection: &Connection, conversation: &Conversation) -> AppResult<()> {
    connection.execute(
        "INSERT INTO conversations(id,project_id,title,status,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6)",
        params![
            conversation.id,
            conversation.project_id,
            conversation.title,
            conversation.status,
            conversation.created_at,
            conversation.updated_at
        ],
    ).map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok(())
}

pub fn conversation(connection: &Connection, conversation_id: &str) -> AppResult<Conversation> {
    connection
        .query_row(
            &format!("SELECT {CONVERSATION_COLUMNS} FROM conversations WHERE id=?1"),
            [conversation_id],
            map_conversation,
        )
        .optional()
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?
        .ok_or_else(|| AppError::new("CONVERSATION_NOT_FOUND", "会话不存在"))
}

/// 最近一次活跃的会话（任意归属）；没有则返回 None。
pub fn latest_conversation(connection: &Connection) -> AppResult<Option<Conversation>> {
    connection
        .query_row(
            &format!(
                "SELECT {CONVERSATION_COLUMNS} FROM conversations WHERE status='active' ORDER BY updated_at DESC LIMIT 1"
            ),
            [],
            map_conversation,
        )
        .optional()
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))
}

pub fn latest_project_conversation(
    connection: &Connection,
    project_id: &str,
) -> AppResult<Option<Conversation>> {
    connection
        .query_row(
            &format!(
                "SELECT {CONVERSATION_COLUMNS} FROM conversations WHERE status='active' AND project_id=?1 ORDER BY updated_at DESC LIMIT 1"
            ),
            [project_id],
            map_conversation,
        )
        .optional()
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))
}

pub fn touch_conversation(connection: &Connection, conversation_id: &str) -> AppResult<()> {
    connection
        .execute(
            "UPDATE conversations SET updated_at=?1 WHERE id=?2",
            params![now(), conversation_id],
        )
        .map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok(())
}

/// 把临时会话提升为项目容器：只改归属，不复制消息。
pub fn attach_conversation_to_project(
    connection: &Connection,
    conversation_id: &str,
    project_id: &str,
) -> AppResult<()> {
    connection
        .execute(
            "UPDATE conversations SET project_id=?1,updated_at=?2 WHERE id=?3",
            params![project_id, now(), conversation_id],
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

    fn test_root() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("lian-db-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn project_and_dataset_survive_reopen() {
        let root = test_root();
        let path = root.join("lian.db");
        {
            let connection = open(&path).unwrap();
            let project = ensure_draft_project(&connection, Some("测试项目")).unwrap();
            assert_eq!(project.name, "测试项目");
            assert_eq!(
                connection
                    .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
                    .unwrap(),
                SCHEMA_VERSION
            );
        }
        {
            let connection = open(&path).unwrap();
            assert_eq!(
                ensure_draft_project(&connection, None).unwrap().name,
                "测试项目"
            );
        }
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn message_reasoning_survives_round_trip() {
        let root = test_root();
        let path = root.join("lian.db");
        let connection = open(&path).unwrap();
        let timestamp = now();
        let conversation = Conversation {
            id: "conversation-1".into(),
            project_id: None,
            title: "测试会话".into(),
            status: "active".into(),
            created_at: timestamp.clone(),
            updated_at: timestamp,
        };
        insert_conversation(&connection, &conversation).unwrap();
        insert_message(
            &connection,
            &conversation.id,
            None,
            "assistant",
            "回答正文",
            Some("真实模型思考"),
        )
        .unwrap();
        let messages = conversation_messages(&connection, &conversation.id).unwrap();
        assert_eq!(messages[0].reasoning.as_deref(), Some("真实模型思考"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn running_workflow_is_marked_interrupted_on_startup_recovery() {
        let root = test_root();
        let path = root.join("lian.db");
        let connection = open(&path).unwrap();
        let project = ensure_draft_project(&connection, Some("恢复测试")).unwrap();
        connection.execute(
            "INSERT INTO workflow_runs(id,task_plan_id,project_id,status,started_at) VALUES('run','plan',?1,'running',?2)",
            params![project.id, now()],
        ).unwrap();
        recover_interrupted_runs(&connection).unwrap();
        let status: String = connection
            .query_row(
                "SELECT status FROM workflow_runs WHERE id='run'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "interrupted");
        drop(connection);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn dataset_version_and_artifact_dag_survive_reopen() {
        let root = test_root();
        let path = root.join("lian.db");
        let project_id;
        let dataset_id = "dataset-v2".to_string();
        let quality_id = "quality-report".to_string();
        {
            let connection = open(&path).unwrap();
            let project = ensure_draft_project(&connection, Some("血缘测试")).unwrap();
            project_id = project.id.clone();
            let dataset = Dataset {
                id: dataset_id.clone(),
                project_id: project.id.clone(),
                name: "株高".into(),
                dataset_type: "phenotype".into(),
                version: 2,
                schema: json!({"traits": [{"id": "height"}]}),
                source: json!({"checksum": "source-sha256"}),
                metadata: json!({}),
                quality_status: "pass".into(),
                supersedes_id: Some("dataset-v1".into()),
                created_at: now(),
            };
            insert_dataset(&connection, &dataset, "/managed/data.csv").unwrap();
            let quality = Artifact {
                id: quality_id.clone(),
                project_id: project.id.clone(),
                artifact_type: "quality.report".into(),
                name: "质量报告".into(),
                status: "pass".into(),
                files: vec![],
                checksum: "quality-sha256".into(),
                upstream_ids: vec![dataset.id.clone()],
                produced_by_run_id: None,
                metadata: json!({}),
                created_at: now(),
            };
            insert_artifact(&connection, &quality, Some(&dataset.id), "/managed/quality").unwrap();
            let report = Artifact {
                id: "analysis-report".into(),
                project_id: project.id,
                artifact_type: "report.analysis".into(),
                name: "分析报告".into(),
                status: "succeeded".into(),
                files: vec![],
                checksum: "report-sha256".into(),
                upstream_ids: vec![quality.id],
                produced_by_run_id: Some("run-1".into()),
                metadata: json!({}),
                created_at: now(),
            };
            insert_artifact(&connection, &report, Some(&dataset.id), "/managed/report").unwrap();
        }
        {
            let connection = open(&path).unwrap();
            let (dataset, _) = dataset(&connection, &dataset_id).unwrap();
            assert_eq!(dataset.version, 2);
            assert_eq!(dataset.supersedes_id.as_deref(), Some("dataset-v1"));
            let (report, source_dataset_id) = artifact(&connection, "analysis-report").unwrap();
            assert_eq!(report.upstream_ids, vec![quality_id]);
            assert_eq!(source_dataset_id.as_deref(), Some(dataset_id.as_str()));
            assert_eq!(project(&connection, &project_id).unwrap().name, "血缘测试");
        }
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn v1_ids_status_and_backup_survive_v2_migration() {
        let root = test_root();
        let path = root.join("lian.db");
        {
            let connection = open(&path).unwrap();
            let project = ensure_draft_project(&connection, Some("迁移测试")).unwrap();
            connection.execute("INSERT INTO source_files(id,project_id,original_name,managed_path,format,sha256,size,created_at) VALUES('source-v1',?1,'old.csv','/old.csv','csv','source-checksum',1,?2)", params![project.id,now()]).unwrap();
            connection.execute("INSERT INTO datasets(id,project_id,name,dataset_type,version,schema_json,source_json,metadata_json,quality_status,canonical_path,created_at) VALUES('dataset-v1',?1,'旧表型','phenotype',1,'{\"layout\":\"long\",\"roles\":{}}','{\"sourceId\":\"source-v1\",\"checksum\":\"source-checksum\"}','{}','pass','/old.csv',?2)", params![project.id,now()]).unwrap();
            connection.execute("INSERT INTO workflow_runs(id,task_plan_id,project_id,status,started_at) VALUES('run-v1','plan-v1',?1,'succeeded',?2)", params![project.id,now()]).unwrap();
            connection.execute("INSERT INTO tool_runs(id,workflow_run_id,tool_id,tool_version,input_json,status,log_text,started_at) VALUES('tool-v1','run-v1','legacy.tool','1','{}','succeeded','ok',?1)", [now()]).unwrap();
            connection.pragma_update(None, "user_version", 1).unwrap();
        }
        let connection = open(&path).unwrap();
        assert_eq!(
            connection
                .query_row(
                    "SELECT status FROM executions WHERE id='tool-v1'",
                    [],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            "completed"
        );
        assert_eq!(
            connection
                .query_row(
                    "SELECT dataset_id FROM dataset_versions WHERE id='dataset-v1'",
                    [],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            "dataset-v1"
        );
        assert!(std::fs::read_dir(&root)
            .unwrap()
            .filter_map(Result::ok)
            .any(|entry| entry.file_name().to_string_lossy().contains("pre-v2")));
        drop(connection);
        std::fs::remove_dir_all(root).unwrap();
    }
}
