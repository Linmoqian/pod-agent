use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

pub fn ensure_project_dirs(root: &Path, project_id: &str) -> AppResult<PathBuf> {
    if project_id.is_empty()
        || !project_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err(AppError::new("INVALID_PROJECT_ID", "项目标识无效"));
    }
    let project = root.join("projects").join(project_id);
    for child in ["sources", "datasets", "artifacts", "runs"] {
        std::fs::create_dir_all(project.join(child)).map_err(|error| {
            AppError::new(
                "STORAGE_CREATE_FAILED",
                format!("创建项目存储失败: {error}"),
            )
        })?;
    }
    Ok(project)
}

pub fn sha256_file(path: &Path) -> AppResult<String> {
    let mut file = File::open(path)
        .map_err(|error| AppError::new("SOURCE_OPEN_FAILED", format!("读取数据源失败: {error}")))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).map_err(|error| {
            AppError::new("SOURCE_READ_FAILED", format!("读取数据源失败: {error}"))
        })?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(hex::encode(hasher.finalize()))
}

pub fn copy_immutable(source: &Path, destination: &Path) -> AppResult<()> {
    if destination.exists() {
        return Ok(());
    }
    let parent = destination
        .parent()
        .ok_or_else(|| AppError::new("INVALID_STORAGE_PATH", "目标路径无父目录"))?;
    std::fs::create_dir_all(parent)
        .map_err(|error| AppError::new("STORAGE_CREATE_FAILED", error.to_string()))?;
    let temporary = parent.join(format!(".{}.tmp", uuid::Uuid::new_v4()));
    let mut input = File::open(source)
        .map_err(|error| AppError::new("SOURCE_OPEN_FAILED", error.to_string()))?;
    let mut output = File::create(&temporary)
        .map_err(|error| AppError::new("STORAGE_WRITE_FAILED", error.to_string()))?;
    std::io::copy(&mut input, &mut output)
        .map_err(|error| AppError::new("STORAGE_WRITE_FAILED", error.to_string()))?;
    output
        .flush()
        .map_err(|error| AppError::new("STORAGE_WRITE_FAILED", error.to_string()))?;
    std::fs::rename(&temporary, destination)
        .map_err(|error| AppError::new("STORAGE_WRITE_FAILED", error.to_string()))?;
    let mut permissions = std::fs::metadata(destination)
        .map_err(|error| AppError::new("STORAGE_METADATA_FAILED", error.to_string()))?
        .permissions();
    permissions.set_readonly(true);
    std::fs::set_permissions(destination, permissions)
        .map_err(|error| AppError::new("STORAGE_PERMISSION_FAILED", error.to_string()))?;
    Ok(())
}

pub fn safe_file_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("dataset")
        .replace(['/', '\\', '\0'], "_")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_like_project_id() {
        let root = std::env::temp_dir();
        assert!(ensure_project_dirs(&root, "../escape").is_err());
    }
}
