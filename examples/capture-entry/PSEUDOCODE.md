# 采集入口伪代码

## 适用范围

这份伪代码对应同目录的 `src/main.rs`，只演示拍照采集入口：冻结一帧、生成照片编号、保存 JPEG、登记 SQLite、按编号回读。它不创建 YOLO 任务，也不启动后台 worker。

## 主流程

```text
程序开始

打印“收到拍照指令”

// 第 1 步：模拟快门瞬间冻结一帧
冻结帧 = 模拟生成一张 640×480 的 RGB 图像
宽度, 高度 = 读取冻结帧尺寸
打印“帧已冻结”

// 第 2 步：生成照片唯一编号
photo_id = 生成 UUID v4
打印 photo_id

// 第 3 步：确定保存位置
数据目录 = 项目根目录 / data / capture-entry-example
照片目录 = 数据目录 / photos
如果照片目录不存在：
    创建照片目录

正式路径 = 照片目录 / (photo_id + ".jpg")
临时路径 = 照片目录 / (photo_id + ".jpg.tmp")

// 第 4 步：原子保存冻结帧
以“只创建新文件”的方式打开临时路径
把冻结帧编码成质量 95 的 JPEG
把 JPEG 写入临时文件
强制把文件内容同步到磁盘
关闭临时文件
把临时文件改名为正式照片
打印正式路径和文件大小

// 第 5 步：准备照片数据库
数据库路径 = 数据目录 / capture.db
连接 SQLite 数据库
如果 photos 表不存在：
    创建 photos 表，包含：
        id
        file_path
        captured_at
        width
        height

// 第 6 步：登记照片
拍摄时间 = 当前本地时间
开始 SQLite 事务

尝试：
    向 photos 表插入：
        id          = photo_id
        file_path   = 正式路径
        captured_at = 拍摄时间
        width       = 宽度
        height      = 高度

    提交事务
    打印“照片档案登记成功”

如果插入或提交失败：
    SQLite 自动回滚未提交的事务
    返回错误并停止程序

// 最后验证 photo_id 与文件路径的对应关系
查询 photos 表中 id 等于 photo_id 的记录

如果找到记录：
    打印 photo_id、文件路径、宽度和高度
    打印“采集入口结束”
否则：
    返回错误

程序结束
```

## 关键数据关系

```text
photo_id
    ↓ 同时作为
JPEG 文件名：photos/{photo_id}.jpg
    ↓ 登记到
photos.id + photos.file_path
    ↓ 查询时使用
WHERE id = photo_id
```

## 预期结果

运行一次后会生成：

```text
data/capture-entry-example/
├── capture.db
└── photos/
    └── {photo_id}.jpg
```

执行命令：

```powershell
cd D:\pod-agent研发\pod-agent\examples\capture-entry
cargo run --offline
```

控制台最后出现“回读成功”，并且照片路径确实存在，即表示采集入口运行成功。
