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

pub fn managed_child_path(directory: &Path, name: &str) -> AppResult<PathBuf> {
    let path = Path::new(name);
    let mut components = path.components();
    let is_single_normal = matches!(components.next(), Some(std::path::Component::Normal(_)))
        && components.next().is_none();
    if !is_single_normal {
        return Err(AppError::new(
            "ARTIFACT_PATH_INVALID",
            "统计工具返回了非法输出路径",
        ));
    }
    Ok(directory.join(path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_like_project_id() {
        let root = std::env::temp_dir();
        assert!(ensure_project_dirs(&root, "../escape").is_err());
    }

    #[test]
    fn immutable_copy_keeps_the_first_source_bytes() {
        let root = std::env::temp_dir().join(format!("lian-storage-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let source = root.join("source.csv");
        let destination = root.join("managed").join("checksum.csv");
        std::fs::write(&source, b"material,value\nA,1\n").unwrap();
        let checksum = sha256_file(&source).unwrap();

        copy_immutable(&source, &destination).unwrap();
        std::fs::write(&source, b"material,value\nA,9\n").unwrap();
        copy_immutable(&source, &destination).unwrap();

        assert_eq!(sha256_file(&destination).unwrap(), checksum);
        assert!(std::fs::metadata(&destination)
            .unwrap()
            .permissions()
            .readonly());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn managed_child_rejects_parent_and_nested_paths() {
        let root = std::env::temp_dir();
        assert!(managed_child_path(&root, "../outside.csv").is_err());
        assert!(managed_child_path(&root, "nested/output.csv").is_err());
        assert_eq!(
            managed_child_path(&root, "output.csv").unwrap(),
            root.join("output.csv")
        );
    }
}
