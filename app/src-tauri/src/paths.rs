use std::fs;
use std::path::PathBuf;

/// 项目根目录（CARGO_MANIFEST_DIR = app/src-tauri/，向上两级）
fn get_project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri 目录无父级")
        .parent()
        .expect("app 目录无父级")
        .to_path_buf()
}

/// 数据根目录：{project_root}/data/
pub fn get_data_dir() -> PathBuf {
    let dir = get_project_root().join("data");
    fs::create_dir_all(&dir).ok();
    dir
}

/// 配置文件路径：{data_dir}/config.json
pub fn get_config_path() -> PathBuf {
    get_data_dir().join("config.json")
}

/// 数据库文件路径：{data_dir}/sessions.db
pub fn get_db_path() -> PathBuf {
    get_data_dir().join("sessions.db")
}

/// 照片目录：{data_dir}/photos/
pub fn get_photos_dir() -> PathBuf {
    let dir = get_data_dir().join("photos");
    fs::create_dir_all(&dir).ok();
    dir
}

/// 缩略图目录：{data_dir}/photos/thumbnails/
pub fn get_thumbnails_dir() -> PathBuf {
    let dir = get_data_dir().join("photos").join("thumbnails");
    fs::create_dir_all(&dir).ok();
    dir
}

/// 模型目录：{data_dir}/models/
pub fn get_models_dir() -> PathBuf {
    let dir = get_data_dir().join("models");
    fs::create_dir_all(&dir).ok();
    dir
}

/// 导出目录：{data_dir}/exports/
pub fn get_exports_dir() -> PathBuf {
    let dir = get_data_dir().join("exports");
    fs::create_dir_all(&dir).ok();
    dir
}

/// 日志目录：{data_dir}/logs/
pub fn get_logs_dir() -> PathBuf {
    let dir = get_data_dir().join("logs");
    fs::create_dir_all(&dir).ok();
    dir
}

/// Tauri 命令：返回数据根目录给前端
#[tauri::command]
pub fn get_data_dir_cmd() -> String {
    get_data_dir().to_string_lossy().to_string()
}
