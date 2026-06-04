pub mod db;
pub mod stream;
pub mod media;

use serde::{Deserialize, Serialize};
use std::sync::Mutex;

/// 前端可见的摄像头设备信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraDevice {
    pub id: String,
    pub name: String,
}

/// 照片记录（对应 photos 表）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Photo {
    pub id: String,
    pub file_path: String,
    pub thumbnail_path: String,
    pub captured_at: String,
    pub width: u32,
    pub height: u32,
    pub mode: String,
}

/// 全局摄像头状态
pub struct CameraState {
    /// 当前活跃的 pump 句柄（None 表示未启动）
    pub pump: Option<cameras::pump::Pump>,
}

impl CameraState {
    pub fn new() -> Self {
        Self { pump: None }
    }
}

pub type CameraStateMutex = Mutex<CameraState>;
