// 只读列出工程工作区文件树，不暴露文件内容或任意路径访问。
// Created on 2026-09-15
// @author: https://github.com/Linmoqian

use serde::Serialize;
use std::path::Path;

use crate::error::{AppError, AppResult};

const MAX_DEPTH: usize = 4;
const MAX_ENTRIES: usize = 500;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileNode {
    pub name: String,
    pub directory: bool,
    pub children: Vec<WorkspaceFileNode>,
}

fn excluded(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "dist" | "target" | ".DS_Store"
    ) || name.starts_with('.')
}

fn list_directory(
    path: &Path,
    depth: usize,
    entries: &mut usize,
) -> Result<Vec<WorkspaceFileNode>, AppError> {
    let directory = std::fs::read_dir(path)
        .map_err(|_| AppError::new("WORKSPACE_UNAVAILABLE", "工作区目录不可读取"))?;
    let mut nodes = Vec::new();
    for entry in directory {
        if *entries >= MAX_ENTRIES {
            break;
        }
        let entry =
            entry.map_err(|_| AppError::new("WORKSPACE_UNAVAILABLE", "工作区文件不可读取"))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if excluded(&name) {
            continue;
        }
        let kind = entry
            .file_type()
            .map_err(|_| AppError::new("WORKSPACE_UNAVAILABLE", "工作区文件类型不可读取"))?;
        if kind.is_symlink() {
            continue;
        }
        *entries += 1;
        let directory = kind.is_dir();
        let children = if directory && depth < MAX_DEPTH {
            list_directory(&entry.path(), depth + 1, entries)?
        } else {
            Vec::new()
        };
        nodes.push(WorkspaceFileNode {
            name,
            directory,
            children,
        });
    }
    nodes.sort_by(|left, right| {
        right
            .directory
            .cmp(&left.directory)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(nodes)
}

#[tauri::command]
pub fn list_workspace_files() -> AppResult<WorkspaceFileNode> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .ok_or_else(|| AppError::new("WORKSPACE_UNAVAILABLE", "未找到工程工作区"))?;
    let mut entries = 0;
    Ok(WorkspaceFileNode {
        name: root
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("工作区")
            .into(),
        directory: true,
        children: list_directory(root, 0, &mut entries)?,
    })
}
