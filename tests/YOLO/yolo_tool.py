# YOLO 指定模型推理与过滤计数，原始检测结果不进入模型上下文。
# Created on 2026-09-14
# @author: https://github.com/Linmoqian

import argparse
import contextlib
import json
import math
import sys
from collections import Counter
from pathlib import Path


def summarize_detections(detections, classes, target, threshold):
    if not math.isfinite(threshold) or not 0 <= threshold <= 1:
        raise ValueError("置信度必须在 0 到 1 之间")
    if target is not None and target not in classes:
        return {"ok": False, "message": "指定模型不支持该类别，不能据此计数"}
    counts = Counter()
    for item in detections:
        label, confidence = item["class_name"], item["confidence"]
        if label not in classes or not math.isfinite(confidence):
            raise ValueError("检测结果无效")
        if confidence >= threshold and (target is None or label == target):
            counts[label] += 1
    if target is not None:
        counts.setdefault(target, 0)
    text = "、".join(f"{key} {value} 个" for key, value in sorted(counts.items()))
    return {"ok": True, "count": sum(counts.values()),
            "message": f"这张照片检测到{text}" if text else "未检测到达到阈值的对象"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--target-class")
    parser.add_argument("--confidence", type=float, default=0.25)
    args = parser.parse_args()
    try:
        if not all(Path(p).is_file() for p in (args.image, args.model)):
            raise ValueError("图片或模型不存在")
        if not math.isfinite(args.confidence) or not 0 <= args.confidence <= 1:
            raise ValueError("置信度无效")
        with contextlib.redirect_stdout(sys.stderr):
            from ultralytics import YOLO

            model = YOLO(
                args.model,
                verbose=False
            )
            result = model.predict(
                source=args.image,
                conf=args.confidence,
                save=False,
                verbose=False
            )[0]
            detections = [
                {"class_name": result.names[int(box.cls[0])],
                 "confidence": float(box.conf[0])}
                for box in result.boxes
            ] if result.boxes is not None else []
            summary = summarize_detections(
                detections,
                list(result.names.values()),
                args.target_class,
                args.confidence
            )
        print(json.dumps(summary, ensure_ascii=False))
    except Exception:
        print(json.dumps({"ok": False, "message": "推理失败，请检查依赖、图片与模型权重"},
                         ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
