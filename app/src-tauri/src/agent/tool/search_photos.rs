use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// search_photos 工具入参（全部可选，缺省即不过滤）
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchArgs {
    class_name: Option<String>,
    batch_label: Option<String>,
    limit: Option<u32>,
}

/// 单张照片（含表型统计 + 路径，供前端渲染缩略图与右侧大图）
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PhotoItem {
    photo_id: String,
    class_name: String,
    captured_at: String,
    file_path: String,
    thumbnail_path: String,
    width: i64,
    height: i64,
    mode: String,
    batch_label: String,
    count: i64,
    avg_confidence: f64,
}

/// 工具实现：按表型类别 / 批次检索照片，按拍摄时间倒序返回。
pub fn run(args: &Value, conn: &Connection) -> Result<Value, String> {
    let q: SearchArgs = if args.is_null() {
        SearchArgs::default()
    } else {
        serde_json::from_value(args.clone()).map_err(|e| format!("参数解析失败: {}", e))?
    };
    let limit = q.limit.unwrap_or(12).clamp(1, 50) as i64;

    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.file_path, p.thumbnail_path, p.captured_at, p.width, p.height, \
                    p.mode, p.batch_label, phe.class_name, phe.count, phe.avg_confidence \
             FROM photos p \
             JOIN phenotypes phe ON phe.photo_id = p.id \
             WHERE (?1 IS NULL OR phe.class_name = ?1) \
               AND (?2 IS NULL OR p.batch_label = ?2) \
             GROUP BY p.id \
             ORDER BY p.captured_at DESC \
             LIMIT ?3",
        )
        .map_err(|e| format!("准备查询失败: {}", e))?;

    let rows = stmt
        .query_map(
            rusqlite::params![q.class_name.as_deref(), q.batch_label.as_deref(), limit],
            |row| {
                Ok(PhotoItem {
                    photo_id: row.get(0)?,
                    file_path: row.get(1)?,
                    thumbnail_path: row.get(2)?,
                    captured_at: row.get(3)?,
                    width: row.get(4)?,
                    height: row.get(5)?,
                    mode: row.get(6)?,
                    batch_label: row.get(7)?,
                    class_name: row.get(8)?,
                    count: row.get(9)?,
                    avg_confidence: row.get(10)?,
                })
            },
        )
        .map_err(|e| format!("查询失败: {}", e))?;

    let list: Vec<PhotoItem> = rows.filter_map(|r| r.ok()).collect();
    let included = list.len() as i64;

    let total: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT p.id) FROM photos p \
             JOIN phenotypes phe ON phe.photo_id = p.id \
             WHERE (?1 IS NULL OR phe.class_name = ?1) \
               AND (?2 IS NULL OR p.batch_label = ?2)",
            rusqlite::params![q.class_name.as_deref(), q.batch_label.as_deref()],
            |row| row.get(0),
        )
        .map_err(|e| format!("统计总数失败: {}", e))?;

    Ok(json!({
        "photos": list,
        "included": included,
        "total": total,
    }))
}

/// OpenAI function calling 工具 schema（与 SearchArgs camelCase 一致）。
pub fn schema() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "search_photos",
            "description": "检索已拍摄的照片（含表型统计），按拍摄时间倒序返回。用户想看/找某类或某批次照片时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "className": {"type": "string", "description": "表型类别筛选，如'豆荚'。留空返回全部类别。"},
                    "batchLabel": {"type": "string", "description": "批次筛选（如'A小区-3棚'）。留空返回全部批次。"},
                    "limit": {"type": "integer", "description": "返回照片数上限，默认 12。"}
                }
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::session::db::init_db;
    use serde_json::json;

    /// 造数据：p1(豆荚+叶片,A批次,06-01)、p2(豆荚,B批次,06-02)、p3(叶片,A批次,06-03)
    fn seed(conn: &Connection) {
        conn.execute(
            "INSERT INTO photos (id, file_path, thumbnail_path, captured_at, width, height, mode, batch_label) \
             VALUES ('p1','/p1.jpg','/t1.jpg','2026-06-01 09:00:00',1920,1080,'photo','A批次')", []).unwrap();
        conn.execute(
            "INSERT INTO photos (id, file_path, thumbnail_path, captured_at, width, height, mode, batch_label) \
             VALUES ('p2','/p2.jpg','/t2.jpg','2026-06-02 09:00:00',1920,1080,'photo','B批次')", []).unwrap();
        conn.execute(
            "INSERT INTO photos (id, file_path, thumbnail_path, captured_at, width, height, mode, batch_label) \
             VALUES ('p3','/p3.jpg','/t3.jpg','2026-06-03 09:00:00',1920,1080,'photo','A批次')", []).unwrap();
        // p1 有两个类别（验证去重）
        conn.execute(
            "INSERT INTO phenotypes (id, photo_id, class_name, count, avg_confidence, min_confidence, max_confidence, items, created_at) \
             VALUES ('ph1a','p1','豆荚',10,0.9,0.8,0.99,'[]','2026-06-01 09:00:00')", []).unwrap();
        conn.execute(
            "INSERT INTO phenotypes (id, photo_id, class_name, count, avg_confidence, min_confidence, max_confidence, items, created_at) \
             VALUES ('ph1b','p1','叶片',3,0.7,0.6,0.8,'[]','2026-06-01 09:00:00')", []).unwrap();
        conn.execute(
            "INSERT INTO phenotypes (id, photo_id, class_name, count, avg_confidence, min_confidence, max_confidence, items, created_at) \
             VALUES ('ph2','p2','豆荚',5,0.85,0.7,0.95,'[]','2026-06-02 09:00:00')", []).unwrap();
        conn.execute(
            "INSERT INTO phenotypes (id, photo_id, class_name, count, avg_confidence, min_confidence, max_confidence, items, created_at) \
             VALUES ('ph3','p3','叶片',8,0.88,0.75,0.96,'[]','2026-06-03 09:00:00')", []).unwrap();
    }

    fn with_seed<F, R>(f: F) -> R
    where
        F: FnOnce(&Connection) -> R,
    {
        let state = init_db(":memory:").expect("init_db 失败");
        let conn = state.conn.lock().unwrap();
        seed(&conn);
        f(&conn)
    }

    #[test]
    fn filters_by_class_name() {
        with_seed(|conn| {
            let v = run(&json!({"className":"豆荚"}), conn).unwrap();
            let photos = v["photos"].as_array().unwrap();
            assert_eq!(photos.len(), 2);
            // 倒序：p2(06-02) 在 p1(06-01) 前
            assert_eq!(photos[0]["photoId"], "p2");
            assert_eq!(photos[1]["photoId"], "p1");
        });
    }

    #[test]
    fn filters_by_batch_label() {
        with_seed(|conn| {
            let v = run(&json!({"batchLabel":"A批次"}), conn).unwrap();
            let photos = v["photos"].as_array().unwrap();
            assert_eq!(photos.len(), 2);
            // A批次：p1(06-01)、p3(06-03)，倒序 p3 在前
            assert_eq!(photos[0]["photoId"], "p3");
            assert_eq!(photos[1]["photoId"], "p1");
        });
    }

    #[test]
    fn dedupes_photo_with_multiple_classes() {
        with_seed(|conn| {
            let v = run(&json!({}), conn).unwrap();
            let photos = v["photos"].as_array().unwrap();
            assert_eq!(photos.len(), 3);
            assert_eq!(v["total"], 3);
        });
    }

    #[test]
    fn respects_limit_and_keeps_total() {
        with_seed(|conn| {
            let v = run(&json!({"limit":2}), conn).unwrap();
            let photos = v["photos"].as_array().unwrap();
            assert_eq!(photos.len(), 2);
            assert_eq!(v["included"], 2);
            assert_eq!(v["total"], 3);
        });
    }

    #[test]
    fn empty_result_when_no_match() {
        with_seed(|conn| {
            let v = run(&json!({"className":"不存在"}), conn).unwrap();
            assert_eq!(v["photos"].as_array().unwrap().len(), 0);
            assert_eq!(v["included"], 0);
            assert_eq!(v["total"], 0);
        });
    }

    #[test]
    fn returns_desc_by_captured_at() {
        with_seed(|conn| {
            let v = run(&json!({}), conn).unwrap();
            let ids: Vec<&str> = v["photos"].as_array().unwrap()
                .iter().map(|p| p["photoId"].as_str().unwrap()).collect();
            assert_eq!(ids, vec!["p3", "p2", "p1"]);
        });
    }
}
