use serde_json::Value;

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
