/*
 * macOS Keychain 凭据边界与自定义 OpenAI 兼容模型目录刷新。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

use serde_json::Value;
use std::collections::HashSet;
use std::time::Duration;

use crate::error::{AppError, AppResult};

const KEYCHAIN_SERVICE: &str = "com.linmoqian.podagent";
const MAX_PROVIDER_ID_LENGTH: usize = 128;
const MAX_BASE_URL_LENGTH: usize = 2048;

fn validate_provider_id(provider_id: &str) -> AppResult<()> {
    let valid = !provider_id.is_empty()
        && provider_id.len() <= MAX_PROVIDER_ID_LENGTH
        && provider_id.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        });
    if valid {
        Ok(())
    } else {
        Err(AppError::new("PROVIDER_ID_INVALID", "Provider ID 格式无效"))
    }
}

fn validate_base_url(base_url: &str) -> AppResult<()> {
    let valid = base_url.len() <= MAX_BASE_URL_LENGTH
        && !base_url.chars().any(char::is_whitespace)
        && reqwest::Url::parse(base_url).is_ok_and(|url| {
            matches!(url.scheme(), "http" | "https")
                && url.host_str().is_some()
                && url.username().is_empty()
                && url.password().is_none()
                && url.query().is_none()
                && url.fragment().is_none()
        });
    if valid {
        Ok(())
    } else {
        Err(AppError::new(
            "PROVIDER_URL_INVALID",
            "自定义 Provider 地址无效",
        ))
    }
}

fn entry(provider_id: &str) -> AppResult<keyring::Entry> {
    validate_provider_id(provider_id)?;
    keyring::Entry::new(KEYCHAIN_SERVICE, provider_id)
        .map_err(|_| AppError::retryable("KEYCHAIN_UNAVAILABLE", "无法访问 macOS Keychain"))
}

fn set_provider_key_sync(provider_id: &str, key: &str) -> AppResult<()> {
    let key = key.trim();
    if key.is_empty() {
        return clear_provider_key_sync(provider_id);
    }
    entry(provider_id)?
        .set_password(key)
        .map_err(|_| AppError::retryable("KEYCHAIN_WRITE_FAILED", "API Key 写入 Keychain 失败"))
}

fn clear_provider_key_sync(provider_id: &str) -> AppResult<()> {
    match entry(provider_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(AppError::retryable(
            "KEYCHAIN_DELETE_FAILED",
            "API Key 从 Keychain 清除失败",
        )),
    }
}

/// 仅供 Rust/Agent 内部读取；完整密钥不通过 Tauri 命令返回 WebView。
pub fn read_provider_key(provider_id: &str) -> AppResult<Option<String>> {
    match entry(provider_id)?.get_password() {
        Ok(key) if !key.is_empty() => Ok(Some(key)),
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(AppError::retryable(
            "KEYCHAIN_READ_FAILED",
            "API Key 从 Keychain 读取失败",
        )),
    }
}

#[tauri::command]
pub async fn set_provider_key(provider_id: String, key: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || set_provider_key_sync(&provider_id, &key))
        .await
        .map_err(|error| AppError::retryable("KEYCHAIN_WRITE_FAILED", error.to_string()))?
}

#[tauri::command]
pub async fn clear_provider_key(provider_id: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || clear_provider_key_sync(&provider_id))
        .await
        .map_err(|error| AppError::retryable("KEYCHAIN_DELETE_FAILED", error.to_string()))?
}

#[tauri::command]
pub async fn get_provider_key_preview(provider_id: String) -> AppResult<Option<String>> {
    let key = tauri::async_runtime::spawn_blocking(move || read_provider_key(&provider_id))
        .await
        .map_err(|error| AppError::retryable("KEYCHAIN_READ_FAILED", error.to_string()))??;
    Ok(key.map(|key| {
        format!(
            "••••{}",
            key.chars()
                .rev()
                .take(4)
                .collect::<String>()
                .chars()
                .rev()
                .collect::<String>()
        )
    }))
}

/// 首次启动迁移旧 localStorage 凭据；成功/失败均不返回密钥内容。
#[tauri::command]
pub async fn migrate_provider_keys(
    credentials: std::collections::HashMap<String, String>,
) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        for (provider_id, key) in credentials {
            set_provider_key_sync(&provider_id, &key)?;
        }
        Ok(())
    })
    .await
    .map_err(|error| AppError::retryable("KEYCHAIN_MIGRATION_FAILED", error.to_string()))?
}

/// Rust 使用 Keychain 完成 /models 请求，只返回非敏感模型 ID。
#[tauri::command]
pub async fn refresh_provider_models(
    provider_id: String,
    base_url: String,
) -> AppResult<Vec<String>> {
    validate_provider_id(&provider_id)?;
    if !provider_id.starts_with("custom-") {
        return Err(AppError::new(
            "PROVIDER_ID_INVALID",
            "模型刷新只允许自定义 Provider",
        ));
    }
    validate_base_url(&base_url)?;
    let key = tauri::async_runtime::spawn_blocking({
        let provider_id = provider_id.clone();
        move || read_provider_key(&provider_id)
    })
    .await
    .map_err(|error| AppError::retryable("KEYCHAIN_READ_FAILED", error.to_string()))??;
    let url = format!("{}/models", base_url.trim_end_matches('/'));
    let mut request = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| AppError::retryable("MODEL_REFRESH_FAILED", "模型目录客户端不可用"))?
        .get(url);
    if let Some(key) = key {
        request = request.bearer_auth(key);
    }
    let response = request.send().await.map_err(|_| {
        AppError::retryable("MODEL_REFRESH_FAILED", "自定义 Provider 模型目录请求失败")
    })?;
    if !response.status().is_success() {
        return Err(AppError::retryable(
            "MODEL_REFRESH_FAILED",
            format!("自定义 Provider 返回 HTTP {}", response.status().as_u16()),
        ));
    }
    let payload = response
        .json::<Value>()
        .await
        .map_err(|_| AppError::retryable("MODEL_CATALOG_INVALID", "模型目录 JSON 无效"))?;
    let mut seen = HashSet::new();
    let models = payload["data"]
        .as_array()
        .ok_or_else(|| AppError::new("MODEL_CATALOG_INVALID", "模型目录缺少 data 数组"))?
        .iter()
        .filter_map(|item| item["id"].as_str())
        .map(str::trim)
        .filter(|model_id| !model_id.is_empty() && model_id.len() <= 512)
        .filter(|model_id| seen.insert((*model_id).to_string()))
        .map(str::to_string)
        .collect::<Vec<_>>();
    if models.is_empty() {
        return Err(AppError::new(
            "MODEL_CATALOG_EMPTY",
            "自定义 Provider 没有可用模型",
        ));
    }
    Ok(models)
}
