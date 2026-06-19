use serde_json::Value;
use std::collections::BTreeMap;

/// 流式 tool_call 解析后的完整结构。
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

/// 累积 OpenAI / DeepSeek-V3 兼容的流式 tool_calls 分片。
/// 按 `index` 聚合 id / name / arguments 字符串，流结束后整体解析。
#[derive(Default)]
pub struct ToolCallAccum {
    inner: BTreeMap<usize, PartialToolCall>,
}

#[derive(Default)]
struct PartialToolCall {
    id: String,
    name: String,
    args_buf: String,
}

impl ToolCallAccum {
    pub fn new() -> Self {
        Self::default()
    }

    /// 喂入一个 `choices[0].delta.tool_calls` 片段（数组）。
    pub fn feed(&mut self, delta_tool_calls: &serde_json::Value) {
        let Some(arr) = delta_tool_calls.as_array() else {
            return;
        };
        for item in arr {
            let index = item
                .get("index")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as usize;
            let part = self.inner.entry(index).or_default();
            if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                if !id.is_empty() {
                    part.id = id.to_string();
                }
            }
            if let Some(f) = item.get("function").and_then(|v| v.as_object()) {
                if let Some(name) = f.get("name").and_then(|v| v.as_str()) {
                    if !name.is_empty() {
                        part.name = name.to_string();
                    }
                }
                if let Some(args) = f.get("arguments").and_then(|v| v.as_str()) {
                    part.args_buf.push_str(args);
                }
            }
        }
    }

    /// 流结束，按 index 升序组装完整 tool_calls。
    pub fn finish(self) -> Vec<ParsedToolCall> {
        self.inner
            .into_values()
            .map(|p| {
                let arguments = if p.args_buf.is_empty() {
                    serde_json::Value::Object(serde_json::Map::new())
                } else {
                    serde_json::from_str(&p.args_buf).unwrap_or(serde_json::Value::Null)
                };
                ParsedToolCall {
                    id: p.id,
                    name: p.name,
                    arguments,
                }
            })
            .collect()
    }
}

/// 从 OpenAI 兼容的 chat completion 响应中提取 assistant 回复文本（非流式场景备用）
#[allow(dead_code)]
pub fn parse_llm_response(json: &Value) -> Result<String, String> {
    let content = json
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .ok_or_else(|| format!("响应格式异常: {}", json))?;
    Ok(content.to_string())
}

/// 从 SSE 流式 chunk 中提取增量内容
/// 格式: data: {"choices":[{"delta":{"content":"..."}}]}
/// 返回 None 表示流结束 ([DONE]) 或无内容
#[allow(dead_code)]
pub fn parse_stream_chunk(line: &str) -> Option<String> {
    let line = line.trim();
    if !line.starts_with("data: ") {
        return None;
    }
    let data = &line[6..];
    if data == "[DONE]" {
        return None;
    }
    let json: Value = serde_json::from_str(data).ok()?;
    json.get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("delta"))
        .and_then(|d| d.get("content"))
        .and_then(|c| c.as_str())
        .map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn single_call_across_chunks() {
        let mut a = ToolCallAccum::new();
        a.feed(&json!([{"index":0,"id":"call_1","type":"function","function":{"name":"query_phenotypes","arguments":"{\"class"}}]));
        a.feed(&json!([{"index":0,"function":{"arguments":"Name\":\"豆荚\"}"}}]));
        let v = a.finish();
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].id, "call_1");
        assert_eq!(v[0].name, "query_phenotypes");
        assert_eq!(v[0].arguments, json!({"className": "豆荚"}));
    }

    #[test]
    fn multiple_calls_by_index() {
        let mut a = ToolCallAccum::new();
        a.feed(&json!([
            {"index":0,"id":"c0","function":{"name":"query_phenotypes","arguments":"{}"}},
            {"index":1,"id":"c1","function":{"name":"query_phenotypes","arguments":"{\"className\":\"叶\"}"}}
        ]));
        let v = a.finish();
        assert_eq!(v.len(), 2);
        assert_eq!(v[0].id, "c0");
        assert_eq!(v[1].arguments, json!({"className":"叶"}));
    }

    #[test]
    fn empty_arguments_become_empty_object() {
        let mut a = ToolCallAccum::new();
        a.feed(&json!([{"index":0,"id":"c0","function":{"name":"q","arguments":""}}]));
        let v = a.finish();
        assert_eq!(v[0].arguments, json!({}));
    }
}
