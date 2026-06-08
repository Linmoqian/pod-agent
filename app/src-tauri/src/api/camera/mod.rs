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
    /// JSON 编码的检测结果，无检测数据时为 None
    pub detections: Option<String>,
}

/// 单个检测目标的结构化表型数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhenotypeItem {
    pub width: f32,
    pub height: f32,
    pub area: f32,
    pub confidence: f32,
}

/// 按 class_name 聚合的表型摘要
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhenotypeSummary {
    pub id: String,
    pub photo_id: String,
    pub class_name: String,
    pub count: usize,
    pub avg_confidence: f32,
    pub min_confidence: f32,
    pub max_confidence: f32,
    pub items: Vec<PhenotypeItem>,
    pub created_at: String,
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
