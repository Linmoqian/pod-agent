# YOLO 单图推理脚本：传入图片路径，逐目标输出 类别 置信度 坐标。
# Created on 2026-09-09
# @author:  https://github.com/Linmoqian

import sys
import time
from pathlib import Path

from ultralytics import YOLO

# 默认模型取仓库根目录的 yolov8n.pt，可用第二个参数覆盖
MODEL_PATH = Path(__file__).resolve().parents[2] / "yolov8n.pt"
IMG_SIZE = 640
CONF = 0.25


def main():
    # 参数校验：图片路径必填，模型路径可选
    if len(sys.argv) < 2:
        sys.stderr.write("用法：python yolo_infer.py <图片路径> [模型路径]\n")
        sys.exit(1)

    image_path = Path(sys.argv[1])
    model_path = Path(sys.argv[2]) if len(sys.argv) > 2 else MODEL_PATH

    if not image_path.is_file():
        sys.stderr.write(f"图片不存在：{image_path}\n")
        sys.exit(1)
    if not model_path.is_file():
        sys.stderr.write(f"模型不存在：{model_path}\n")
        sys.exit(1)

    # 关闭自带日志，stdout 只保留检测结果供上层程序解析
    model = YOLO(
        str(model_path),
        verbose=False
    )

    start = time.perf_counter()
    results = model.predict(
        source=str(image_path),
        imgsz=IMG_SIZE,
        conf=CONF,
        verbose=False
    )
    elapsed = time.perf_counter() - start

    # 单图任务只取第一个结果，逐目标打印检测行
    result = results[0]
    boxes = result.boxes
    count = len(boxes) if boxes is not None else 0
    if boxes is not None:
        for box in boxes:
            label = result.names[int(box.cls[0])]
            conf = float(box.conf[0])
            xyxy = [str(round(v)) for v in box.xyxy[0].tolist()]
            print(f"{label} {conf:.2f} " + " ".join(xyxy))

    print(f"检测完成：共 {count} 个目标（conf>{CONF}），耗时 {elapsed:.1f} 秒")


if __name__ == "__main__":
    main()