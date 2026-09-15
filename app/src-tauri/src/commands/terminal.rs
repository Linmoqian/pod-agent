// 开发人员模式下执行当前工程内的一次性终端命令。
// Created on 2026-09-16
// @author: https://github.com/Linmoqian

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::Ordering;
use std::time::Instant;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

const MAX_COMMAND_BYTES: usize = 16 * 1024;
const MAX_OUTPUT_BYTES: usize = 256 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalRunRequest {
    pub command: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalRunResult {
    pub stdout: String,
    pub stderr: String,
    pub status: Option<i32>,
    pub success: bool,
    pub truncated: bool,
    pub duration_ms: u64,
    pub cwd: String,
}

fn workspace_root() -> AppResult<PathBuf> {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .ok_or_else(|| AppError::new("WORKSPACE_UNAVAILABLE", "未找到工程工作区"))
}

#[cfg(target_os = "macos")]
fn terminal_shell() -> &'static str {
    "/bin/zsh"
}

#[cfg(not(target_os = "macos"))]
fn terminal_shell() -> &'static str {
    "/bin/sh"
}

fn truncate_output(bytes: &[u8]) -> (String, bool) {
    let text = String::from_utf8_lossy(bytes);
    if text.len() <= MAX_OUTPUT_BYTES {
        return (text.into_owned(), false);
    }

    let mut end = MAX_OUTPUT_BYTES;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    (
        format!("{}\n[输出已截断，单次最多显示 256 KiB]", &text[..end]),
        true,
    )
}

fn execute_command(root: PathBuf, command: String) -> AppResult<TerminalRunResult> {
    let started = Instant::now();
    let output = Command::new(terminal_shell())
        .args(["-lc", &command])
        .current_dir(root)
        .output()
        .map_err(|error| AppError::new("TERMINAL_EXEC_FAILED", error.to_string()))?;
    let (stdout, stdout_truncated) = truncate_output(&output.stdout);
    let (stderr, stderr_truncated) = truncate_output(&output.stderr);

    Ok(TerminalRunResult {
        stdout,
        stderr,
        status: output.status.code(),
        success: output.status.success(),
        truncated: stdout_truncated || stderr_truncated,
        duration_ms: started.elapsed().as_millis().min(u64::MAX as u128) as u64,
        cwd: "当前工程根目录".into(),
    })
}

#[tauri::command]
pub fn set_terminal_access(enabled: bool, state: State<'_, AppState>) -> AppResult<()> {
    state.terminal_enabled.store(enabled, Ordering::Release);
    Ok(())
}

#[tauri::command]
pub async fn run_terminal_command(
    request: TerminalRunRequest,
    state: State<'_, AppState>,
) -> AppResult<TerminalRunResult> {
    if !state.terminal_enabled.load(Ordering::Acquire) {
        return Err(AppError::new(
            "TERMINAL_LOCKED",
            "请在设置中选择开发人员模式后使用终端",
        ));
    }

    let command = request.command.trim().to_owned();
    if command.is_empty() {
        return Err(AppError::new(
            "TERMINAL_COMMAND_REQUIRED",
            "请输入要执行的命令",
        ));
    }
    if command.len() > MAX_COMMAND_BYTES {
        return Err(AppError::new(
            "TERMINAL_COMMAND_TOO_LARGE",
            "命令长度不能超过 16 KiB",
        ));
    }

    let root = workspace_root()?;
    tauri::async_runtime::spawn_blocking(move || execute_command(root, command))
        .await
        .map_err(|error| AppError::retryable("TERMINAL_TASK_FAILED", error.to_string()))?
}
