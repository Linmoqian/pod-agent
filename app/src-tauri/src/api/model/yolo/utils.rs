use serde::Serialize;
use usls::{Config, ORTConfig};

/// 检测结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Detection {
    pub class_id: usize,
    pub class_name: String,
    pub confidence: f32,
    pub x_min: f32,
    pub y_min: f32,
    pub x_max: f32,
    pub y_max: f32,
}

/// 构建 YOLO 检测模型配置
pub fn build_detect_config(model_path: &str) -> Result<Config, String> {
    let ort_config = ORTConfig {
        file: model_path.to_string(),
        ..Default::default()
    };
    Ok(Config::yolo_detect().with_model(ort_config))
}

/// 从 usls 的 Y 结果中提取检测框
pub fn extract_detections(result: &usls::Y, class_names: &[&str]) -> Vec<Detection> {
    result
        .hbbs
        .iter()
        .map(|hbb| {
            let meta = hbb.meta();
            let class_id = meta.id().unwrap_or(0);
            let class_name = meta
                .name()
                .map(|s| s.to_string())
                .unwrap_or_else(|| {
                    class_names
                        .get(class_id)
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| format!("class_{}", class_id))
                });

            Detection {
                class_id,
                class_name,
                confidence: meta.confidence().unwrap_or(0.0),
                x_min: hbb.xmin(),
                y_min: hbb.ymin(),
                x_max: hbb.xmax(),
                y_max: hbb.ymax(),
            }
        })
        .collect()
}
