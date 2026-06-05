use image::{ImageBuffer, Rgb};

use super::utils::Detection;

/// YOLOv8 默认推理尺寸
pub const MODEL_INPUT_SIZE: u32 = 640;

/// Letterbox 填充色（YOLO 标准灰色）
const PAD_VALUE: u8 = 114;

/// Letterbox 缩放参数，用于后处理坐标映射
pub struct LetterboxInfo {
    pub scale: f32,
    pub pad_x: u32,
    pub pad_y: u32,
}

/// Letterbox 缩放：原图 → MODEL_INPUT_SIZE × MODEL_INPUT_SIZE（保持宽高比，居中填充灰色）
pub fn letterbox(rgb: &[u8], w: u32, h: u32) -> (Vec<u8>, LetterboxInfo) {
    let target = MODEL_INPUT_SIZE;

    // 缩放因子（取较小值，保持宽高比）
    let scale = (target as f32 / w as f32).min(target as f32 / h as f32);
    let new_w = (w as f32 * scale).round() as u32;
    let new_h = (h as f32 * scale).round() as u32;

    // 居中 padding
    let pad_x = (target - new_w) / 2;
    let pad_y = (target - new_h) / 2;

    // 用 image crate 缩放原图
    let src = ImageBuffer::<Rgb<u8>, _>::from_raw(w, h, rgb.to_vec())
        .unwrap_or_else(|| ImageBuffer::from_pixel(w, h, Rgb([PAD_VALUE, PAD_VALUE, PAD_VALUE])));
    let resized = image::imageops::resize(
        &src,
        new_w,
        new_h,
        image::imageops::FilterType::Triangle,
    );

    // 创建 target×target 灰色画布，粘贴缩放图像
    let mut canvas = ImageBuffer::from_pixel(target, target, Rgb([PAD_VALUE, PAD_VALUE, PAD_VALUE]));
    for (x, y, pixel) in resized.enumerate_pixels() {
        canvas.put_pixel(pad_x + x, pad_y + y, *pixel);
    }

    (
        canvas.into_raw(),
        LetterboxInfo {
            scale,
            pad_x,
            pad_y,
        },
    )
}

/// 将推理坐标映射回原图坐标
pub fn map_to_original(detections: &mut [Detection], info: &LetterboxInfo) {
    for det in detections.iter_mut() {
        det.x_min = (det.x_min - info.pad_x as f32) / info.scale;
        det.y_min = (det.y_min - info.pad_y as f32) / info.scale;
        det.x_max = (det.x_max - info.pad_x as f32) / info.scale;
        det.y_max = (det.y_max - info.pad_y as f32) / info.scale;
    }
}
