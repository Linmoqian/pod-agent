//! YOLO 集成测试
//!
//! 运行方式: cd app/src-tauri && cargo test --test yolo_integration
//!
//! 前提: data/models/yolo11n.onnx 模型文件存在

use std::path::PathBuf;

/// 获取项目根目录
fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf()
}

/// 获取模型路径
fn model_path() -> PathBuf {
    project_root().join("data/models/yolov8n.onnx")
}

/// 获取测试图片路径
fn test_image_path() -> PathBuf {
    project_root().join("data/photos/20260604_142531.jpg")
}

#[test]
fn test_build_detect_config() {
    let path = model_path();
    if !path.exists() {
        eprintln!("跳过: 模型文件不存在 {:?}", path);
        return;
    }

    let config = pod_agent_lib::api::model::yolo::utils::build_detect_config(
        path.to_str().unwrap(),
    );
    assert!(config.is_ok(), "配置构建失败: {:?}", config.err());
}

#[test]
fn test_extract_detections_empty() {
    let result = usls::Y::default();
    let detections = pod_agent_lib::api::model::yolo::utils::extract_detections(&result);
    assert!(detections.is_empty(), "空结果应返回空检测列表");
}

#[test]
fn test_load_model_and_detect_photo() {
    let model = model_path();
    let image = test_image_path();

    if !model.exists() {
        eprintln!("跳过: 模型文件不存在 {:?}", model);
        return;
    }
    if !image.exists() {
        eprintln!("跳过: 测试图片不存在 {:?}", image);
        return;
    }

    // 1. 构建配置并加载模型
    let config = pod_agent_lib::api::model::yolo::utils::build_detect_config(
        model.to_str().unwrap(),
    )
    .expect("配置构建失败");

    let mut model_state = pod_agent_lib::api::model::yolo::YOLOState::new();
    {
        use usls::Model;
        let yolo = usls::models::YOLO::new(config).expect("模型加载失败");
        model_state.model = Some(yolo);
    }

    // 2. 加载测试图片并推理
    let img = usls::Image::try_read(image.to_str().unwrap()).expect("图片加载失败");
    let runtime = model_state.model.as_mut().expect("模型未加载");
    let results = runtime.forward(&[img]).expect("推理失败");

    // 3. 提取检测结果
    let detections = results
        .first()
        .map(pod_agent_lib::api::model::yolo::utils::extract_detections)
        .unwrap_or_default();

    println!("检测到 {} 个目标:", detections.len());
    for d in &detections {
        println!(
            "  {} ({:.1}%) [{:.0}, {:.0}, {:.0}, {:.0}]",
            d.class_name,
            d.confidence * 100.0,
            d.x_min,
            d.y_min,
            d.x_max,
            d.y_max,
        );
    }

    // yolo11n 在 COCO 图片上至少应检测到一些目标
    assert!(!detections.is_empty(), "应检测到至少 1 个目标");

    // 验证检测框数据合理性
    for d in &detections {
        assert!(d.confidence > 0.0 && d.confidence <= 1.0, "置信度范围错误");
        assert!(d.x_max > d.x_min, "x_max 应大于 x_min");
        assert!(d.y_max > d.y_min, "y_max 应大于 y_min");
        assert!(!d.class_name.is_empty(), "类名不应为空");
    }
}

#[test]
fn test_detect_from_rgb_bytes() {
    let model = model_path();
    if !model.exists() {
        eprintln!("跳过: 模型文件不存在 {:?}", model);
        return;
    }

    let config = pod_agent_lib::api::model::yolo::utils::build_detect_config(
        model.to_str().unwrap(),
    )
    .expect("配置构建失败");

    let mut model_state = pod_agent_lib::api::model::yolo::YOLOState::new();
    {
        use usls::Model;
        let yolo = usls::models::YOLO::new(config).expect("模型加载失败");
        model_state.model = Some(yolo);
    }

    // 构造一个 640x480 的纯色 RGB 图像
    let width = 640u32;
    let height = 480u32;
    let rgb_bytes = vec![128u8; (width * height * 3) as usize];
    let img = usls::Image::from_u8s(&rgb_bytes, width, height).expect("图像创建失败");

    let runtime = model_state.model.as_mut().expect("模型未加载");
    let results = runtime.forward(&[img]).expect("推理失败");

    let detections = results
        .first()
        .map(pod_agent_lib::api::model::yolo::utils::extract_detections)
        .unwrap_or_default();

    // 纯色图像可能检测不到任何目标，这是正常的
    println!("纯色图像检测到 {} 个目标", detections.len());
}
