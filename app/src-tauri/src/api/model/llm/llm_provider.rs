use serde::{Deserialize, Serialize};
use std::fs;
use std::time::Instant;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LLMConfig {
    pub provider: String,
    pub api_key: String,
    pub endpoint: String,
    pub model: String,
    #[serde(default)]
    pub session_db_path: String,
}

impl Default for LLMConfig {
    fn default() -> Self {
        Self {
            provider: "openai".to_string(),
            api_key: String::new(),
            endpoint: "https://api.openai.com/v1".to_string(),
            model: "gpt-4".to_string(),
            session_db_path: String::new(),
        }
    }
}

#[tauri::command]
pub fn save_llm_config(config: LLMConfig) -> Result<(), String> {
    let path = crate::paths::get_config_path();
    let json = serde_json::to_string_pretty(&config).map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("写入配置失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn load_llm_config() -> Result<LLMConfig, String> {
    let path = crate::paths::get_config_path();
    if !path.exists() {
        return Ok(LLMConfig::default());
    }
    let json = fs::read_to_string(&path).map_err(|e| format!("读取配置失败: {}", e))?;
    let config: LLMConfig = serde_json::from_str(&json).map_err(|e| format!("解析配置失败: {}", e))?;
    Ok(config)
}

#[tauri::command]
pub fn get_llm_config_path() -> String {
    crate::paths::get_config_path().to_string_lossy().to_string()
}

pub fn resolve_db_path(config: &LLMConfig) -> String {
    if config.session_db_path.is_empty() {
        crate::paths::get_db_path().to_string_lossy().to_string()
    } else {
        config.session_db_path.clone()
    }
}

#[derive(Serialize)]
pub struct TestResult {
    pub success: bool,
    pub latency_ms: u128,
    pub message: String,
}

#[tauri::command]
pub async fn test_llm_connection(config: LLMConfig) -> Result<TestResult, String> {
    let url = format!("{}/chat/completions", config.endpoint.trim_end_matches('/'));
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "model": config.model,
        "messages": [{ "role": "user", "content": "Hi" }],
        "max_tokens": 5,
    });

    let start = Instant::now();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    let latency = start.elapsed().as_millis();

    if response.status().is_success() {
        Ok(TestResult {
            success: true,
            latency_ms: latency,
            message: format!("连接成功，延迟 {}ms", latency),
        })
    } else {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        Ok(TestResult {
            success: false,
            latency_ms: latency,
            message: format!("HTTP {}: {}", status, text),
        })
    }
}
