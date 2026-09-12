use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::error::{AppError, AppResult};

fn worker_script() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("python")
        .join("worker.py")
}

fn environment_python(root: &Path) -> PathBuf {
    let base = root.join("envs").join("lian-breeding-v1");
    if cfg!(windows) {
        base.join("python.exe")
    } else {
        base.join("bin").join("python")
    }
}

pub fn python_executable() -> AppResult<PathBuf> {
    if let Some(configured) = std::env::var_os("LIAN_PYTHON_BIN") {
        let path = PathBuf::from(configured);
        return path.is_file().then_some(path).ok_or_else(|| {
            AppError::new(
                "PYTHON_RUNTIME_UNAVAILABLE",
                "LIAN_PYTHON_BIN 指向的解释器不存在",
            )
        });
    }
    if let Some(conda_executable) = std::env::var_os("CONDA_EXE") {
        if let Some(root) = Path::new(&conda_executable).parent().and_then(Path::parent) {
            let path = environment_python(root);
            if path.is_file() {
                return Ok(path);
            }
        }
    }
    if let Some(home) = std::env::var_os("HOME") {
        for distribution in ["miniforge3", "miniconda3", "anaconda3"] {
            let path = environment_python(&PathBuf::from(&home).join(distribution));
            if path.is_file() {
                return Ok(path);
            }
        }
    }
    Err(AppError::new(
        "PYTHON_RUNTIME_UNAVAILABLE",
        "未找到 lian-breeding-v1 的 Python 解释器",
    ))
}

pub fn run(operation: &str, config_path: &Path) -> AppResult<Value> {
    let output = Command::new(python_executable()?)
        .arg(worker_script())
        .arg(operation)
        .arg(config_path)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| {
            AppError::new(
                "PYTHON_RUNTIME_UNAVAILABLE",
                format!("无法启动 lian-breeding-v1 统计环境: {error}"),
            )
        })?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let payload: Value = stdout
        .lines()
        .rev()
        .find_map(|line| serde_json::from_str(line).ok())
        .ok_or_else(|| AppError::new("WORKER_PROTOCOL_ERROR", "统计进程未返回有效 JSON"))?;
    if !output.status.success() || payload["ok"] != Value::Bool(true) {
        return Err(AppError::new(
            "WORKER_FAILED",
            payload["error"].as_str().unwrap_or("统计进程执行失败"),
        ));
    }
    Ok(payload["result"].clone())
}
