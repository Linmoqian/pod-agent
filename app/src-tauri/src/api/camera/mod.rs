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
