use usls::Image;

/// 从 RGB 字节创建 usls Image
pub fn rgb_bytes_to_image(rgb: &[u8], width: u32, height: u32) -> Result<Image, String> {
    Image::from_u8s(rgb, width, height).map_err(|e| format!("创建图像失败: {}", e))
}

/// 从文件路径加载 usls Image
pub fn load_image(path: &str) -> Result<Image, String> {
    Image::try_read(path).map_err(|e| format!("加载图片失败: {}", e))
}
