use serde_json::Value;

/// 从 OpenAI 兼容的 chat completion 响应中提取 assistant 回复文本
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
