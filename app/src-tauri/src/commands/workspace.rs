// 只读列出并读取工程工作区内受限的文本文件，不暴露任意路径访问。
// Created on 2026-09-15
// @author: https://github.com/Linmoqian

use serde::Serialize;
use std::path::{Component, Path, PathBuf};

use crate::error::{AppError, AppResult};

const MAX_DEPTH: usize = 4;
const MAX_ENTRIES: usize = 500;
const MAX_PREVIEW_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileNode {
    pub name: String,
    pub relative_path: String,
    pub directory: bool,
    pub children: Vec<WorkspaceFileNode>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFilePreview {
    pub name: String,
    pub relative_path: String,
    pub kind: String,
    pub language: String,
    pub content: String,
}

fn excluded(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "dist" | "target" | ".DS_Store"
    ) || name.starts_with('.')
}

fn workspace_root() -> AppResult<PathBuf> {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .ok_or_else(|| AppError::new("WORKSPACE_UNAVAILABLE", "未找到工程工作区"))
}

fn relative_path_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn preview_language(path: &Path) -> Option<(&'static str, &'static str)> {
    let name = path.file_name()?.to_str()?.to_ascii_lowercase();
    if name == "dockerfile" {
        return Some(("code", "dockerfile"));
    }
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    match extension.as_str() {
        "md" | "markdown" => Some(("markdown", "markdown")),
        "ts" | "tsx" | "cts" | "mts" => Some(("code", "typescript")),
        "js" | "jsx" | "mjs" | "cjs" => Some(("code", "javascript")),
        "rs" => Some(("code", "rust")),
        "py" => Some(("code", "python")),
        "css" => Some(("code", "css")),
        "scss" => Some(("code", "scss")),
        "html" => Some(("code", "html")),
        "xml" | "svg" => Some(("code", "xml")),
        "vue" | "svelte" => Some(("code", "html")),
        "json" => Some(("code", "json")),
        "yaml" | "yml" => Some(("code", "yaml")),
        "toml" | "ini" => Some(("code", "ini")),
        "sh" | "bash" | "zsh" | "fish" => Some(("code", "shell")),
        "sql" => Some(("code", "sql")),
        "go" => Some(("code", "go")),
        "java" => Some(("code", "java")),
        "c" | "h" => Some(("code", "c")),
        "cc" | "cpp" | "cxx" | "hh" | "hpp" => Some(("code", "cpp")),
        "swift" => Some(("code", "swift")),
        "kt" | "kts" => Some(("code", "kotlin")),
        "rb" => Some(("code", "ruby")),
        "php" => Some(("code", "php")),
        "lock" => Some(("code", "plaintext")),
        _ => None,
    }
}

fn resolve_workspace_file(root: &Path, relative_path: &str) -> AppResult<PathBuf> {
    let unavailable = || AppError::new("WORKSPACE_FILE_UNAVAILABLE", "工作区文件不可读取");
    let relative = Path::new(relative_path);
    let components: Vec<_> = relative.components().collect();
    let has_excluded_component = components.iter().any(|component| match component {
        Component::Normal(name) => name.to_str().map(excluded).unwrap_or(true),
        _ => true,
    });
    if relative_path.trim().is_empty()
        || relative.is_absolute()
        || components.len() > MAX_DEPTH + 1
        || has_excluded_component
    {
        return Err(unavailable());
    }

    let mut candidate = root.to_path_buf();
    for component in components {
        let Component::Normal(name) = component else {
            return Err(unavailable());
        };
        candidate.push(name);
        let metadata = std::fs::symlink_metadata(&candidate).map_err(|_| unavailable())?;
        if metadata.file_type().is_symlink() {
            return Err(unavailable());
        }
    }

    let canonical_root = root.canonicalize().map_err(|_| unavailable())?;
    let canonical_candidate = candidate.canonicalize().map_err(|_| unavailable())?;
    if !canonical_candidate.starts_with(&canonical_root) || !canonical_candidate.is_file() {
        return Err(unavailable());
    }
    Ok(canonical_candidate)
}

fn list_directory(
    path: &Path,
    relative_path: &Path,
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
        let child_relative_path = relative_path.join(&name);
        let children = if directory && depth < MAX_DEPTH {
            list_directory(&entry.path(), &child_relative_path, depth + 1, entries)?
        } else {
            Vec::new()
        };
        nodes.push(WorkspaceFileNode {
            name,
            relative_path: relative_path_string(&child_relative_path),
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
    let root = workspace_root()?;
    let mut entries = 0;
    Ok(WorkspaceFileNode {
        name: root
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("工作区")
            .into(),
        relative_path: String::new(),
        directory: true,
        children: list_directory(&root, Path::new(""), 0, &mut entries)?,
    })
}

#[tauri::command]
pub fn read_workspace_file(relative_path: String) -> AppResult<WorkspaceFilePreview> {
    let root = workspace_root()?;
    let path = resolve_workspace_file(&root, &relative_path)?;
    let (kind, language) = preview_language(&path).ok_or_else(|| {
        AppError::new(
            "WORKSPACE_FILE_UNSUPPORTED",
            "仅支持查看 Markdown 和代码文件",
        )
    })?;
    let metadata = std::fs::metadata(&path)
        .map_err(|_| AppError::new("WORKSPACE_FILE_UNAVAILABLE", "工作区文件不可读取"))?;
    if metadata.len() > MAX_PREVIEW_BYTES {
        return Err(AppError::new(
            "WORKSPACE_FILE_TOO_LARGE",
            "文件超过 1 MB，暂不支持预览",
        ));
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|_| AppError::new("WORKSPACE_FILE_UNAVAILABLE", "文件不是可读取的文本内容"))?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("工作区文件")
        .to_owned();
    Ok(WorkspaceFilePreview {
        name,
        relative_path: relative_path_string(Path::new(&relative_path)),
        kind: kind.into(),
        language: language.into(),
        content,
    })
}
