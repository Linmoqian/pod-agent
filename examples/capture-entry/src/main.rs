// 导入 JPEG 编码、RGB 图像、SQLite 和文件路径操作需要的类型。
use image::{codecs::jpeg::JpegEncoder, Rgb, RgbImage};
use rusqlite::{params, Connection};
use std::{error::Error, fs, path::PathBuf};

// 程序入口：? 遇到错误就返回错误并停止程序。
fn main() -> Result<(), Box<dyn Error>> {
    // 程序开始，模拟收到拍照指令。
    println!("收到拍照指令");

    // 第 1 步：用一张 640×480 的纯色 RGB 图像模拟冻结帧，并读取尺寸。
    let frozen_frame = RgbImage::from_pixel(640, 480, Rgb([100, 150, 200]));
    let (width, height) = frozen_frame.dimensions();
    println!("帧已冻结：{width}×{height}");

    // 第 2 步：生成 UUID v4，作为照片编号。
    let photo_id = uuid::Uuid::new_v4().to_string();
    println!("photo_id：{photo_id}");

    // 第 3 步：从示例目录向上两级找到项目根目录，创建照片目录。
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let project_root = manifest_dir
        .parent()
        .and_then(|path| path.parent())
        .ok_or("无法定位项目根目录")?;
    let data_dir = project_root.join("data").join("capture-entry-example");
    let photos_dir = data_dir.join("photos");
    fs::create_dir_all(&photos_dir)?;

    // 同一个 photo_id 同时用于正式文件名和临时文件名。
    let photo_path = photos_dir.join(format!("{photo_id}.jpg"));
    let temporary_path = photos_dir.join(format!("{photo_id}.jpg.tmp"));

    // 第 4 步：只创建新的临时文件，以质量 95 编码 JPEG，写入并同步到磁盘。
    let mut temporary_file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary_path)?;
    JpegEncoder::new_with_quality(&mut temporary_file, 95).encode_image(&frozen_frame)?;
    temporary_file.sync_all()?;
    // 关闭临时文件后改名，让正式路径对应完整的 JPEG。
    drop(temporary_file);
    fs::rename(&temporary_path, &photo_path)?;

    // 读取并打印保存后的文件路径和大小。
    let saved_bytes = fs::metadata(&photo_path)?.len();
    println!(
        "照片已保存：{}（{} 字节）",
        photo_path.display(),
        saved_bytes
    );

    // 第 5 步：连接 capture.db；photos 表不存在时创建表。
    let database_path = data_dir.join("capture.db");
    let mut connection = Connection::open(&database_path)?;
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS photos (
            id          TEXT PRIMARY KEY,
            file_path   TEXT NOT NULL UNIQUE,
            captured_at TEXT NOT NULL,
            width       INTEGER NOT NULL,
            height      INTEGER NOT NULL
        );",
    )?;

    // 第 6 步：取得当前本地时间，开始事务并插入照片记录。
    // 插入或提交失败时，? 返回错误，未提交的事务会自动回滚（不会删除 JPEG）。
    let captured_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let transaction = connection.transaction()?;
    transaction.execute(
        "INSERT INTO photos (id, file_path, captured_at, width, height)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            photo_id,
            photo_path.to_string_lossy(),
            captured_at,
            width,
            height
        ],
    )?;
    // 提交事务，确认记录已保存到数据库。
    transaction.commit()?;
    println!("照片档案登记成功");

    // 按 photo_id 回读路径和尺寸；查不到记录时，query_row 返回错误。
    let (stored_path, stored_width, stored_height): (String, u32, u32) = connection.query_row(
        "SELECT file_path, width, height FROM photos WHERE id = ?1",
        [&photo_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;
    // 打印回读结果，正常结束程序。
    println!("回读成功：{photo_id} → {stored_path}（{stored_width}×{stored_height}）");
    println!("采集入口结束");

    Ok(())
}
