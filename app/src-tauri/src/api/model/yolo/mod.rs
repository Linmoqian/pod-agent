pub mod detect;
pub mod process;
pub mod utils;

use std::sync::Mutex;
use usls::Runtime;
use usls::models::YOLO;

/// YOLO 模型状态
pub struct YOLOState {
    pub model: Option<Runtime<YOLO>>,
}

impl YOLOState {
    pub fn new() -> Self {
        Self { model: None }
    }
}

pub type YOLOStateMutex = Mutex<YOLOState>;
