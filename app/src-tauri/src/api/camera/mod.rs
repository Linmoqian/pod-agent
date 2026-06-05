pub mod db;
pub mod stream;
pub mod media;

use serde::{Deserialize, Serialize};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use usls::Runtime;
use usls::models::YOLO;

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

/// YOLO 模型的共享句柄，pump 回调可 clone Arc 进闭包
pub type YoloHandle = Arc<Mutex<Option<Runtime<YOLO>>>>;

/// 全局摄像头状态
pub struct CameraState {
    /// 当前活跃的 pump 句柄（None 表示未启动）
    pub pump: Option<cameras::pump::Pump>,
    /// YOLO 模型共享句柄，pump 回调每 N 帧读取推理
    pub yolo: YoloHandle,
    /// 是否启用实时检测（前端 toggleDetection 同步到 Rust）
    pub detecting: Arc<AtomicBool>,
}

impl CameraState {
    pub fn new() -> Self {
        Self {
            pump: None,
            yolo: Arc::new(Mutex::new(None)),
            detecting: Arc::new(AtomicBool::new(false)),
        }
    }
}

pub type CameraStateMutex = Mutex<CameraState>;
