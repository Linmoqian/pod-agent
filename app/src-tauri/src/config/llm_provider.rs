use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LLMConfig {
    pub provider: String,
    pub api_key: String,
    pub endpoint: String,
    pub model: String,
}

impl Default for LLMConfig {
    fn default() -> Self {
        Self {
            provider: "openai".to_string(),
            api_key: String::new(),
            endpoint: "https://api.openai.com/v1".to_string(),
            model: "gpt-4".to_string(),
        }
    }
}

fn get_config_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".pod-agent").join("config.json")
}

fn ensure_config_dir() -> Result<(), String> {
    let path = get_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn save_llm_config(config: LLMConfig) -> Result<(), String> {
    ensure_config_dir()?;
    let path = get_config_path();
    let json = serde_json::to_string_pretty(&config).map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("写入配置失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn load_llm_config() -> Result<LLMConfig, String> {
    let path = get_config_path();
    if !path.exists() {
        return Ok(LLMConfig::default());
    }
    let json = fs::read_to_string(&path).map_err(|e| format!("读取配置失败: {}", e))?;
    let config: LLMConfig = serde_json::from_str(&json).map_err(|e| format!("解析配置失败: {}", e))?;
    Ok(config)
}

#[tauri::command]
pub fn get_llm_config_path() -> String {
    get_config_path().to_string_lossy().to_string()
}
