use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// query_phenotypes 工具入参（全部可选，缺省即不过滤）
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QueryArgs {
    class_name: Option<String>,
    photo_id: Option<String>,
    limit: Option<u32>,
}

/// 单行表型真相（含 n_low/n_high/reviewed，不粉饰）
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PhenotypeRow {
    photo_id: String,
    class_name: String,
    count: i32,
    avg_confidence: f32,
    min_confidence: f32,
    max_confidence: f32,
    n_low: i32,
    n_high: i32,
    reviewed: bool,
    created_at: String,
}

/// 工具实现：按条件查询表型聚合，返回带真相字段的结果。
/// 人类与 LLM 共用此实现（经由 execute_tool 分发）。
pub fn run(args: &Value, conn: &Connection) -> Result<Value, String> {
    let q: QueryArgs = if args.is_null() {
        QueryArgs::default()
    } else {
        serde_json::from_value(args.clone()).map_err(|e| format!("参数解析失败: {}", e))?
    };
    let limit = q.limit.unwrap_or(50).clamp(1, 500);

    let mut stmt = conn
        .prepare(
            "SELECT photo_id, class_name, count, avg_confidence, min_confidence, max_confidence, \
                    n_low, n_high, reviewed, created_at \
             FROM phenotypes \
             WHERE (?1 IS NULL OR class_name = ?1) \
               AND (?2 IS NULL OR photo_id = ?2) \
             ORDER BY created_at DESC LIMIT ?3",
        )
        .map_err(|e| format!("准备查询失败: {}", e))?;

    let rows = stmt.query_map(
        rusqlite::params![q.class_name.as_deref(), q.photo_id.as_deref(), limit],
        |row| {
            Ok(PhenotypeRow {
                photo_id: row.get(0)?,
                class_name: row.get(1)?,
                count: row.get(2)?,
                avg_confidence: row.get(3)?,
                min_confidence: row.get(4)?,
                max_confidence: row.get(5)?,
                n_low: row.get(6)?,
                n_high: row.get(7)?,
                reviewed: row.get::<_, i32>(8)? != 0,
                created_at: row.get(9)?,
            })
        },
    )
    .map_err(|e| format!("查询失败: {}", e))?;

    let list: Vec<PhenotypeRow> = rows.filter_map(|r| r.ok()).collect();
    let included = list.len() as i64;

    // 总匹配数（不受 LIMIT 影响）——尊重真相：告知用户还有多少未返回
    let total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM phenotypes \
             WHERE (?1 IS NULL OR class_name = ?1) AND (?2 IS NULL OR photo_id = ?2)",
            rusqlite::params![q.class_name.as_deref(), q.photo_id.as_deref()],
            |row| row.get(0),
        )
        .map_err(|e| format!("统计总数失败: {}", e))?;

    Ok(json!({
        "rows": list,
        "included": included,
        "total": total,
    }))
}
