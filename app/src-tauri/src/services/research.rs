// M2 科研语义、不可变数据版本与通用血缘服务。
// Created on 2026-09-12
// @author: https://github.com/Linmoqian

use csv::{ReaderBuilder, StringRecord, WriterBuilder};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use unicode_normalization::UnicodeNormalization;

use crate::domain::{
    Artifact, DatasetVersion, Environment, Execution, LineageEdge, LineageNode, LineageSubgraph,
    Material, MaterialContext, ProjectOverview, ResearchSchema, TaskPlanRun, TraitDefinition,
};
use crate::error::{AppError, AppResult};
use crate::services::{db, storage};

pub fn exact_key(value: &str) -> String {
    value.trim().nfc().collect()
}

fn suggestion_key(value: &str) -> String {
    exact_key(value)
        .to_lowercase()
        .chars()
        .filter(|character| character.is_alphanumeric())
        .collect()
}

pub fn material_suggestions(
    connection: &Connection,
    project_id: &str,
    values: &[String],
) -> AppResult<Vec<Value>> {
    let materials = materials(connection, project_id)?;
    let mut suggestions = Vec::new();
    for source in values {
        let exact = exact_key(source);
        if materials.iter().any(|item| item.canonical_code == exact) {
            continue;
        }
        let comparable = suggestion_key(source);
        for material in &materials {
            if comparable == suggestion_key(&material.canonical_code) {
                suggestions.push(json!({
                    "sourceValue": source,
                    "targetMaterialId": material.id,
                    "targetCode": material.canonical_code,
                    "reasonCode": "NORMALIZED_FORM_EQUAL"
                }));
            }
        }
    }
    Ok(suggestions)
}

fn hash_json(value: &Value) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.to_string().as_bytes());
    hex::encode(hasher.finalize())
}

fn index(headers: &StringRecord, name: &str) -> AppResult<usize> {
    headers
        .iter()
        .position(|value| value == name)
        .ok_or_else(|| {
            AppError::new(
                "SEMANTIC_SCHEMA_INVALID",
                format!("规范数据缺少字段: {name}"),
            )
        })
}

fn existing_material(
    connection: &Connection,
    project_id: &str,
    key: &str,
) -> AppResult<Option<String>> {
    connection
        .query_row(
            "SELECT id FROM materials WHERE project_id=?1 AND exact_key=?2 UNION SELECT material_id FROM material_aliases WHERE project_id=?1 AND exact_key=?2 LIMIT 1",
            params![project_id, key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))
}

fn ensure_material(
    connection: &Connection,
    project_id: &str,
    label: &str,
    resolutions: &BTreeMap<String, String>,
) -> AppResult<(String, String)> {
    let key = exact_key(label);
    if let Some(id) = existing_material(connection, project_id, &key)? {
        return Ok((id, "exact".into()));
    }
    if let Some(target) = resolutions
        .get(label)
        .filter(|value| value.as_str() != "new")
    {
        let exists: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM materials WHERE id=?1 AND project_id=?2)",
                params![target, project_id],
                |row| row.get(0),
            )
            .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
        if !exists {
            return Err(AppError::new(
                "MATERIAL_RESOLUTION_INVALID",
                "目标材料不存在",
            ));
        }
        let decision_id = uuid::Uuid::new_v4().to_string();
        connection.execute(
            "INSERT INTO identity_decisions(id,project_id,entity_kind,source_value,decision,target_id,reason,actor,created_at) VALUES(?1,?2,'material',?3,'link',?4,'用户确认近似身份','local_user',?5)",
            params![decision_id,project_id,label,target,db::now()],
        ).map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
        connection.execute(
            "INSERT INTO material_aliases(id,project_id,material_id,alias,exact_key,decision_id,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7)",
            params![uuid::Uuid::new_v4().to_string(),project_id,target,label,key,decision_id,db::now()],
        ).map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
        return Ok((target.clone(), "user_confirmed".into()));
    }
    let id = uuid::Uuid::new_v4().to_string();
    connection.execute(
        "INSERT INTO materials(id,project_id,canonical_code,exact_key,display_name,metadata_json,created_at) VALUES(?1,?2,?3,?4,?3,'{}',?5)",
        params![id,project_id,key,key,db::now()],
    ).map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok((id, "created".into()))
}

fn ensure_trait(
    connection: &Connection,
    project_id: &str,
    label: &str,
    unit: Option<&str>,
) -> AppResult<String> {
    let code = exact_key(label);
    let unit = unit.map(exact_key).filter(|value| !value.is_empty());
    let existing: Option<(String, Option<String>)> = connection.query_row(
        "SELECT id,unit FROM traits WHERE project_id=?1 AND canonical_code=?2 ORDER BY created_at LIMIT 1",
        params![project_id,code],
        |row| Ok((row.get(0)?,row.get(1)?)),
    ).optional().map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    if let Some((id, existing_unit)) = existing {
        if existing_unit != unit && existing_unit.is_some() && unit.is_some() {
            return Err(AppError::new(
                "TRAIT_UNIT_CONFLICT",
                format!("性状 {label} 的单位与项目词表冲突"),
            ));
        }
        return Ok(id);
    }
    let id = uuid::Uuid::new_v4().to_string();
    connection.execute(
        "INSERT INTO traits(id,project_id,canonical_code,name,value_type,unit,created_at) VALUES(?1,?2,?3,?3,'continuous',?4,?5)",
        params![id,project_id,code,unit,db::now()],
    ).map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok(id)
}

fn ensure_environment(connection: &Connection, project_id: &str, label: &str) -> AppResult<String> {
    let code = exact_key(label);
    if let Some(id) = connection
        .query_row(
            "SELECT id FROM environments WHERE project_id=?1 AND canonical_code=?2",
            params![project_id, code],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?
    {
        return Ok(id);
    }
    let id = uuid::Uuid::new_v4().to_string();
    connection.execute(
        "INSERT INTO environments(id,project_id,canonical_code,name,treatment_json,metadata_json,created_at) VALUES(?1,?2,?3,?3,'{}','{}',?4)",
        params![id,project_id,code,db::now()],
    ).map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok(id)
}

pub struct SemanticDataset {
    pub schema: Value,
    pub metadata: Value,
    pub canonical_path: String,
    pub canonical_checksum: String,
    pub schema_id: String,
    pub material_ids: Vec<(String, String, String)>,
    pub trait_ids: Vec<(String, String)>,
    pub environment_ids: Vec<(String, String)>,
}

pub fn semanticize_dataset(
    connection: &Connection,
    project_id: &str,
    normalized: &Value,
    resolutions: &BTreeMap<String, String>,
) -> AppResult<SemanticDataset> {
    let source_path = Path::new(
        normalized["canonicalPath"]
            .as_str()
            .ok_or_else(|| AppError::new("WORKER_PROTOCOL_ERROR", "缺少规范化数据路径"))?,
    );
    let target_path = source_path.with_file_name("semantic.csv");
    let mut reader = ReaderBuilder::new()
        .from_path(source_path)
        .map_err(|error| AppError::new("SEMANTIC_READ_FAILED", error.to_string()))?;
    let headers = reader
        .headers()
        .map_err(|error| AppError::new("SEMANTIC_READ_FAILED", error.to_string()))?
        .clone();
    let material_at = index(&headers, "material_id")?;
    let environment_at = index(&headers, "environment_id")?;
    let trait_at = index(&headers, "trait_id")?;
    let unit_at = index(&headers, "unit")?;
    let mut rows = Vec::new();
    let mut material_map: BTreeMap<String, (String, String)> = BTreeMap::new();
    let mut trait_map: BTreeMap<String, String> = BTreeMap::new();
    let mut environment_map: BTreeMap<String, String> = BTreeMap::new();
    for row in reader.records() {
        let row = row.map_err(|error| AppError::new("SEMANTIC_READ_FAILED", error.to_string()))?;
        let material_label = row.get(material_at).unwrap_or_default().to_string();
        let trait_label = row.get(trait_at).unwrap_or_default().to_string();
        let environment_label = row.get(environment_at).unwrap_or_default().to_string();
        let unit = row.get(unit_at).filter(|value| !value.trim().is_empty());
        let material = if let Some(value) = material_map.get(&material_label) {
            value.clone()
        } else {
            let value = ensure_material(connection, project_id, &material_label, resolutions)?;
            material_map.insert(material_label.clone(), value.clone());
            value
        };
        let trait_id = if let Some(value) = trait_map.get(&trait_label) {
            value.clone()
        } else {
            let value = ensure_trait(connection, project_id, &trait_label, unit)?;
            trait_map.insert(trait_label.clone(), value.clone());
            value
        };
        let environment_id = if let Some(value) = environment_map.get(&environment_label) {
            value.clone()
        } else {
            let value = ensure_environment(connection, project_id, &environment_label)?;
            environment_map.insert(environment_label.clone(), value.clone());
            value
        };
        rows.push((
            row,
            material,
            trait_id,
            environment_id,
            material_label,
            trait_label,
            environment_label,
        ));
    }
    let mut writer = WriterBuilder::new()
        .from_path(&target_path)
        .map_err(|error| AppError::new("SEMANTIC_WRITE_FAILED", error.to_string()))?;
    let mut semantic_headers = headers.clone();
    semantic_headers.push_field("source_material_label");
    semantic_headers.push_field("source_trait_label");
    semantic_headers.push_field("source_environment_label");
    writer
        .write_record(&semantic_headers)
        .map_err(|error| AppError::new("SEMANTIC_WRITE_FAILED", error.to_string()))?;
    for (row, material, trait_id, environment_id, material_label, trait_label, environment_label) in
        rows
    {
        let mut values = row.iter().map(str::to_owned).collect::<Vec<_>>();
        values[material_at] = material.0;
        values[trait_at] = trait_id;
        values[environment_at] = environment_id;
        values.extend([material_label, trait_label, environment_label]);
        writer
            .write_record(&values)
            .map_err(|error| AppError::new("SEMANTIC_WRITE_FAILED", error.to_string()))?;
    }
    writer
        .flush()
        .map_err(|error| AppError::new("SEMANTIC_WRITE_FAILED", error.to_string()))?;
    let traits = trait_map
        .iter()
        .map(|(label, id)| json!({"id":id,"name":label,"valueType":"continuous","unit":null}))
        .collect::<Vec<_>>();
    let schema = json!({
        "version":"2.0.0","layout":"long",
        "roles":{"materialId":"material_id","environmentId":"environment_id","replicateId":"replicate_id","blockId":"block_id","traitId":"trait_id","value":"value","unit":"unit"},
        "fields": semantic_headers.iter().map(|name| {
            let required = matches!(name, "material_id" | "environment_id" | "trait_id" | "value");
            json!({"name":name,"required":required})
        }).collect::<Vec<_>>(),
        "traits":traits
    });
    let canonical_checksum = storage::sha256_file(&target_path)?;
    let checksum = hash_json(&schema);
    let schema_id = connection
        .query_row(
            "SELECT id FROM research_schemas WHERE project_id=?1 AND checksum=?2",
            params![project_id, checksum],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    connection.execute(
        "INSERT OR IGNORE INTO research_schemas(id,project_id,dataset_type,version,layout,fields_json,roles_json,checksum,created_at) VALUES(?1,?2,'phenotype',2,'long',?3,?4,?5,?6)",
        params![schema_id,project_id,schema["fields"].to_string(),schema["roles"].to_string(),checksum,db::now()],
    ).map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok(SemanticDataset {
        schema,
        metadata: json!({"mapping":normalized["metadata"]["mapping"],"rowCount":normalized["metadata"]["rowCount"],"semanticVersion":"2.0.0"}),
        canonical_path: target_path.to_string_lossy().into(),
        canonical_checksum,
        schema_id,
        material_ids: material_map
            .into_iter()
            .map(|(label, (id, resolution))| (id, label, resolution))
            .collect(),
        trait_ids: trait_map
            .into_iter()
            .map(|(label, id)| (id, label))
            .collect(),
        environment_ids: environment_map
            .into_iter()
            .map(|(label, id)| (id, label))
            .collect(),
    })
}

fn node_id(kind: &str, entity_id: &str) -> String {
    format!("{kind}:{entity_id}")
}

pub fn add_node(
    connection: &Connection,
    project_id: &str,
    kind: &str,
    entity_id: &str,
    label: &str,
    metadata: Value,
) -> AppResult<String> {
    let id = node_id(kind, entity_id);
    connection.execute(
        "INSERT OR IGNORE INTO research_nodes(id,project_id,kind,entity_id,label,metadata_json,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7)",
        params![id,project_id,kind,entity_id,label,metadata.to_string(),db::now()],
    ).map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok(id)
}

pub fn add_edge(
    connection: &Connection,
    project_id: &str,
    upstream: &str,
    downstream: &str,
    relation: &str,
) -> AppResult<()> {
    if upstream == downstream {
        return Err(AppError::new("LINEAGE_CYCLE", "血缘节点不能指向自身"));
    }
    let cross_project: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM research_nodes a JOIN research_nodes b ON b.id=?2 WHERE a.id=?1 AND a.project_id=b.project_id AND a.project_id=?3)",
        params![upstream,downstream,project_id],
        |row| row.get(0),
    ).map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    if !cross_project {
        return Err(AppError::new(
            "LINEAGE_NODE_INVALID",
            "血缘节点不存在或跨 Project",
        ));
    }
    let cycle: bool = connection.query_row(
        "WITH RECURSIVE reach(id) AS (SELECT downstream_node_id FROM lineage_edges WHERE upstream_node_id=?1 UNION SELECT e.downstream_node_id FROM lineage_edges e JOIN reach r ON e.upstream_node_id=r.id) SELECT EXISTS(SELECT 1 FROM reach WHERE id=?2)",
        params![downstream,upstream],
        |row| row.get(0),
    ).map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    if cycle {
        return Err(AppError::new("LINEAGE_CYCLE", "血缘边会形成环"));
    }
    connection.execute(
        "INSERT OR IGNORE INTO lineage_edges(id,project_id,upstream_node_id,downstream_node_id,relation,created_at) VALUES(?1,?2,?3,?4,?5,?6)",
        params![uuid::Uuid::new_v4().to_string(),project_id,upstream,downstream,relation,db::now()],
    ).map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    Ok(())
}

pub fn register_dataset_version(
    connection: &Connection,
    dataset_id: &str,
    project_id: &str,
    name: &str,
    source_id: &str,
    semantic: &SemanticDataset,
) -> AppResult<()> {
    connection.execute(
        "INSERT OR IGNORE INTO research_datasets(id,project_id,name,dataset_type,current_version_id,created_at,updated_at) VALUES(?1,?2,?3,'phenotype',?1,?4,?4)",
        params![dataset_id,project_id,name,db::now()],
    ).map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    connection.execute(
        "INSERT INTO dataset_versions(id,dataset_id,project_id,version,source_file_id,schema_id,canonical_path,canonical_checksum,quality_status,metadata_json,created_at) VALUES(?1,?1,?2,1,?3,?4,?5,?6,?7,?8,?9)",
        params![dataset_id,project_id,source_id,semantic.schema_id,semantic.canonical_path,semantic.canonical_checksum,semantic.metadata["qualityStatus"].as_str().unwrap_or("pass"),semantic.metadata.to_string(),db::now()],
    ).map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    for (id, label, resolution) in &semantic.material_ids {
        connection.execute("INSERT INTO dataset_materials(dataset_version_id,material_id,source_label,resolution) VALUES(?1,?2,?3,?4)",params![dataset_id,id,label,resolution]).map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    }
    for (id, label) in &semantic.trait_ids {
        connection.execute("INSERT INTO dataset_traits(dataset_version_id,trait_id,source_label) VALUES(?1,?2,?3)",params![dataset_id,id,label]).map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    }
    for (id, label) in &semantic.environment_ids {
        connection.execute("INSERT INTO dataset_environments(dataset_version_id,environment_id,source_label) VALUES(?1,?2,?3)",params![dataset_id,id,label]).map_err(|error| AppError::new("DB_WRITE_FAILED", error.to_string()))?;
    }
    let source_node = add_node(
        connection,
        project_id,
        "sourceFile",
        source_id,
        name,
        json!({}),
    )?;
    let version_node = add_node(
        connection,
        project_id,
        "datasetVersion",
        dataset_id,
        &format!("{name} v1"),
        json!({"checksum":semantic.canonical_checksum}),
    )?;
    add_edge(
        connection,
        project_id,
        &source_node,
        &version_node,
        "legacy_source_of",
    )?;
    Ok(())
}

pub fn materials(connection: &Connection, project_id: &str) -> AppResult<Vec<Material>> {
    let mut statement = connection.prepare("SELECT id,project_id,canonical_code,display_name,origin,generation,metadata_json,created_at FROM materials WHERE project_id=?1 ORDER BY canonical_code")
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    let rows = statement
        .query_map([project_id], |row| {
            Ok(Material {
                id: row.get(0)?,
                project_id: row.get(1)?,
                canonical_code: row.get(2)?,
                display_name: row.get(3)?,
                origin: row.get(4)?,
                generation: row.get(5)?,
                metadata: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or(Value::Null),
                created_at: row.get(7)?,
            })
        })
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))
}

pub fn traits(connection: &Connection, project_id: &str) -> AppResult<Vec<TraitDefinition>> {
    let mut statement = connection.prepare("SELECT id,project_id,canonical_code,name,value_type,unit,method,scale,ontology_ref,created_at FROM traits WHERE project_id=?1 ORDER BY canonical_code").map_err(|error| AppError::new("DB_QUERY_FAILED",error.to_string()))?;
    let rows = statement
        .query_map([project_id], |row| {
            Ok(TraitDefinition {
                id: row.get(0)?,
                project_id: row.get(1)?,
                canonical_code: row.get(2)?,
                name: row.get(3)?,
                value_type: row.get(4)?,
                unit: row.get(5)?,
                method: row.get(6)?,
                scale: row.get(7)?,
                ontology_ref: row.get(8)?,
                created_at: row.get(9)?,
            })
        })
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))
}

pub fn environments(connection: &Connection, project_id: &str) -> AppResult<Vec<Environment>> {
    let mut statement = connection.prepare("SELECT id,project_id,canonical_code,name,location,year,season,treatment_json,metadata_json,created_at FROM environments WHERE project_id=?1 ORDER BY canonical_code").map_err(|error|AppError::new("DB_QUERY_FAILED",error.to_string()))?;
    let rows = statement
        .query_map([project_id], |row| {
            Ok(Environment {
                id: row.get(0)?,
                project_id: row.get(1)?,
                canonical_code: row.get(2)?,
                name: row.get(3)?,
                location: row.get(4)?,
                year: row.get(5)?,
                season: row.get(6)?,
                treatment: serde_json::from_str(&row.get::<_, String>(7)?).unwrap_or(Value::Null),
                metadata: serde_json::from_str(&row.get::<_, String>(8)?).unwrap_or(Value::Null),
                created_at: row.get(9)?,
            })
        })
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))
}

pub fn overview(connection: &Connection, project_id: &str) -> AppResult<ProjectOverview> {
    let project = db::project(connection, project_id)?;
    let count = |table: &str| -> AppResult<usize> {
        connection
            .query_row(
                &format!("SELECT count(*) FROM {table} WHERE project_id=?1"),
                [project_id],
                |row| row.get::<_, i64>(0),
            )
            .map(|value| value as usize)
            .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))
    };
    let material_count = count("materials")?;
    let dataset_count = count("research_datasets")?;
    let execution_count = count("executions")?;
    let artifact_count = count("artifacts")?;
    let pending_resolution_count: usize = connection
        .query_row(
            "SELECT count(*) FROM import_sessions WHERE project_id=?1 AND status='pending'",
            [project_id],
            |row| row.get::<_, i64>(0),
        )
        .map(|value| value as usize)
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    let mut facts = vec![format!(
        "项目包含 {material_count} 个材料、{dataset_count} 个 Dataset。"
    )];
    if pending_resolution_count > 0 {
        facts.push(format!(
            "有 {pending_resolution_count} 次数据导入等待语义确认。"
        ));
    }
    if execution_count > 0 {
        facts.push(format!("已记录 {execution_count} 次可追溯工具执行。"));
    }
    Ok(ProjectOverview {
        project,
        material_count,
        dataset_count,
        execution_count,
        artifact_count,
        pending_resolution_count,
        facts,
    })
}

pub fn schemas(connection: &Connection, project_id: &str) -> AppResult<Vec<ResearchSchema>> {
    let mut statement=connection.prepare("SELECT id,project_id,dataset_type,version,layout,fields_json,roles_json,checksum,created_at FROM research_schemas WHERE project_id=?1 ORDER BY created_at").map_err(|error|AppError::new("DB_QUERY_FAILED",error.to_string()))?;
    let rows = statement
        .query_map([project_id], |row| {
            Ok(ResearchSchema {
                id: row.get(0)?,
                project_id: row.get(1)?,
                dataset_type: row.get(2)?,
                version: row.get(3)?,
                layout: row.get(4)?,
                fields: serde_json::from_str(&row.get::<_, String>(5)?).unwrap_or(Value::Null),
                roles: serde_json::from_str(&row.get::<_, String>(6)?).unwrap_or(Value::Null),
                checksum: row.get(7)?,
                created_at: row.get(8)?,
            })
        })
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))
}

pub fn lineage(
    connection: &Connection,
    kind: &str,
    entity_id: &str,
    direction: &str,
    max_depth: i64,
) -> AppResult<LineageSubgraph> {
    let root_id = node_id(kind, entity_id);
    let project_id: String = connection
        .query_row(
            "SELECT project_id FROM research_nodes WHERE id=?1",
            [&root_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::new("LINEAGE_NODE_NOT_FOUND", "血缘节点不存在"))?;
    let depth = max_depth.clamp(1, 5);
    let mut ids = BTreeSet::from([root_id.clone()]);
    let mut frontier = BTreeSet::from([root_id]);
    for _ in 0..depth {
        let mut next = BTreeSet::new();
        for id in &frontier {
            let sql=match direction {"upstream"=>"SELECT upstream_node_id FROM lineage_edges WHERE downstream_node_id=?1","downstream"=>"SELECT downstream_node_id FROM lineage_edges WHERE upstream_node_id=?1",_=>"SELECT upstream_node_id FROM lineage_edges WHERE downstream_node_id=?1 UNION SELECT downstream_node_id FROM lineage_edges WHERE upstream_node_id=?1"};
            let mut statement = connection
                .prepare(sql)
                .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
            for value in statement
                .query_map([id], |row| row.get::<_, String>(0))
                .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?
            {
                let value =
                    value.map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
                if ids.insert(value.clone()) {
                    next.insert(value);
                }
            }
        }
        frontier = next;
    }
    let mut nodes = Vec::new();
    for id in &ids {
        nodes.push(connection.query_row("SELECT kind,entity_id,project_id,label,metadata_json,created_at FROM research_nodes WHERE id=?1",[id],|row|Ok(LineageNode{kind:row.get(0)?,id:row.get(1)?,project_id:row.get(2)?,label:row.get(3)?,metadata:serde_json::from_str(&row.get::<_,String>(4)?).unwrap_or(Value::Null),created_at:row.get(5)?})).map_err(|error|AppError::new("DB_QUERY_FAILED",error.to_string()))?);
    }
    let mut edges = Vec::new();
    let mut statement=connection.prepare("SELECT id,project_id,upstream_node_id,downstream_node_id,relation,created_at FROM lineage_edges WHERE project_id=?1 ORDER BY created_at,id").map_err(|error|AppError::new("DB_QUERY_FAILED",error.to_string()))?;
    for edge in statement
        .query_map([&project_id], |row| {
            Ok(LineageEdge {
                id: row.get(0)?,
                project_id: row.get(1)?,
                upstream_node_id: row.get(2)?,
                downstream_node_id: row.get(3)?,
                relation: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?
    {
        let edge = edge.map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
        if ids.contains(&edge.upstream_node_id) && ids.contains(&edge.downstream_node_id) {
            edges.push(edge);
        }
    }
    Ok(LineageSubgraph {
        root: crate::domain::EntityRef {
            kind: kind.into(),
            id: entity_id.into(),
        },
        nodes,
        edges,
    })
}

pub fn execution(connection: &Connection, id: &str) -> AppResult<Execution> {
    connection.query_row("SELECT id,task_plan_run_id,project_id,step_id,tool_id,tool_version,inputs_json,parameters_json,runtime_json,status,fingerprint,exit_code,error_code,error_message,stdout_json,stderr_json,logs_truncated,started_at,finished_at FROM executions WHERE id=?1",[id],|row|Ok(Execution{id:row.get(0)?,task_plan_run_id:row.get(1)?,project_id:row.get(2)?,step_id:row.get(3)?,tool_id:row.get(4)?,tool_version:row.get(5)?,inputs:serde_json::from_str(&row.get::<_,String>(6)?).unwrap_or(Value::Null),parameters:serde_json::from_str(&row.get::<_,String>(7)?).unwrap_or(Value::Null),runtime:serde_json::from_str(&row.get::<_,String>(8)?).unwrap_or(Value::Null),status:row.get(9)?,reproducibility_fingerprint:row.get(10)?,exit_code:row.get(11)?,error_code:row.get(12)?,error_message:row.get(13)?,stdout:row.get::<_,Option<String>>(14)?.and_then(|value|serde_json::from_str(&value).ok()),stderr:row.get::<_,Option<String>>(15)?.and_then(|value|serde_json::from_str(&value).ok()),logs_truncated:row.get::<_,i64>(16)?!=0,started_at:row.get(17)?,finished_at:row.get(18)?})).map_err(|_|AppError::new("EXECUTION_NOT_FOUND","Execution 不存在"))
}

pub fn executions(connection: &Connection, project_id: &str) -> AppResult<Vec<Execution>> {
    let mut statement = connection
        .prepare("SELECT id FROM executions WHERE project_id=?1 ORDER BY started_at,id")
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    let ids = statement
        .query_map([project_id], |row| row.get::<_, String>(0))
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    ids.map(|id| {
        let id = id.map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
        execution(connection, &id)
    })
    .collect()
}

pub fn task_plan_runs(connection: &Connection, project_id: &str) -> AppResult<Vec<TaskPlanRun>> {
    let mut statement = connection.prepare("SELECT id,task_plan_id,project_id,status,error_code,error_message,started_at,finished_at FROM task_plan_runs WHERE project_id=?1 ORDER BY started_at,id")
        .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
    let rows = statement
        .query_map([project_id], |row| {
            Ok(TaskPlanRun {
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

pub fn material_context(connection: &Connection, id: &str) -> AppResult<MaterialContext> {
    let material = materials(
        connection,
        &connection
            .query_row(
                "SELECT project_id FROM materials WHERE id=?1",
                [id],
                |row| row.get::<_, String>(0),
            )
            .map_err(|_| AppError::new("MATERIAL_NOT_FOUND", "材料不存在"))?,
    )?
    .into_iter()
    .find(|item| item.id == id)
    .ok_or_else(|| AppError::new("MATERIAL_NOT_FOUND", "材料不存在"))?;
    let aliases = {
        let mut statement = connection
            .prepare("SELECT alias FROM material_aliases WHERE material_id=?1 ORDER BY alias")
            .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
        let values = statement
            .query_map([id], |row| row.get(0))
            .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?
            .filter_map(Result::ok)
            .collect();
        values
    };
    let datasets = {
        let mut statement = connection.prepare("SELECT v.id,v.dataset_id,v.project_id,v.version,v.source_file_id,v.schema_id,v.canonical_checksum,v.quality_status,v.supersedes_version_id,v.metadata_json,v.created_at FROM dataset_versions v JOIN dataset_materials m ON m.dataset_version_id=v.id WHERE m.material_id=?1 ORDER BY v.created_at,v.id")
            .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
        let rows = statement
            .query_map([id], |row| {
                Ok(DatasetVersion {
                    id: row.get(0)?,
                    dataset_id: row.get(1)?,
                    project_id: row.get(2)?,
                    version: row.get(3)?,
                    source_file_id: row.get(4)?,
                    schema_id: row.get(5)?,
                    canonical_checksum: row.get(6)?,
                    quality_status: row.get(7)?,
                    supersedes_version_id: row.get(8)?,
                    metadata: serde_json::from_str(&row.get::<_, String>(9)?)
                        .unwrap_or(Value::Null),
                    created_at: row.get(10)?,
                })
            })
            .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| AppError::new("DB_QUERY_FAILED", error.to_string()))?
    };
    let traits = traits(connection, &material.project_id)?;
    let environments = environments(connection, &material.project_id)?;
    let artifacts: Vec<Artifact> = db::artifacts(connection, &material.project_id)?;
    Ok(MaterialContext {
        material,
        aliases,
        datasets,
        traits,
        environments,
        artifacts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn similar_material_codes_are_suggestions_not_merges() {
        let root = std::env::temp_dir().join(format!("lian-research-{}", uuid::Uuid::new_v4()));
        let connection = db::open(&root.join("lian.db")).unwrap();
        let project = db::ensure_draft_project(&connection, Some("语义测试")).unwrap();
        connection.execute("INSERT INTO materials(id,project_id,canonical_code,exact_key,display_name,metadata_json,created_at) VALUES('a017',?1,'A017','A017','A017','{}',?2)", params![project.id,db::now()]).unwrap();
        let suggestions = material_suggestions(
            &connection,
            &project.id,
            &[" A017 ".into(), "a017".into(), "A-017".into()],
        )
        .unwrap();
        assert_eq!(suggestions.len(), 2);
        assert_eq!(materials(&connection, &project.id).unwrap().len(), 1);
        drop(connection);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn lineage_rejects_cycles_and_cross_project_edges() {
        let root = std::env::temp_dir().join(format!("lian-lineage-{}", uuid::Uuid::new_v4()));
        let connection = db::open(&root.join("lian.db")).unwrap();
        let first = db::ensure_draft_project(&connection, Some("项目一")).unwrap();
        let second_id = uuid::Uuid::new_v4().to_string();
        connection.execute("INSERT INTO projects(id,name,status,created_at,updated_at) VALUES(?1,'项目二','active',?2,?2)", params![second_id,db::now()]).unwrap();
        let a = add_node(&connection, &first.id, "sourceFile", "a", "a", json!({})).unwrap();
        let b = add_node(
            &connection,
            &first.id,
            "datasetVersion",
            "b",
            "b",
            json!({}),
        )
        .unwrap();
        let c = add_node(&connection, &second_id, "artifact", "c", "c", json!({})).unwrap();
        add_edge(&connection, &first.id, &a, &b, "input_to").unwrap();
        assert_eq!(
            add_edge(&connection, &first.id, &b, &a, "produced")
                .unwrap_err()
                .code,
            "LINEAGE_CYCLE"
        );
        assert_eq!(
            add_edge(&connection, &first.id, &a, &c, "input_to")
                .unwrap_err()
                .code,
            "LINEAGE_NODE_INVALID"
        );
        drop(connection);
        std::fs::remove_dir_all(root).unwrap();
    }
}
