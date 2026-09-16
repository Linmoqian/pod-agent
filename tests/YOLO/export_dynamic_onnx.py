# 导出支持动态 Batch 的 YOLO ONNX 模型并校验输入输出维度。
# Created on 2026-09-16
# @author: https://github.com/Linmoqian

from pathlib import Path
import shutil
import tempfile

import onnx
from ultralytics import YOLO


MODEL_PATH = Path(__file__).with_name("yolov8n.pt")
ONNX_PATH = MODEL_PATH.with_suffix(".onnx")
STATIC_ONNX_PATH = MODEL_PATH.with_name("yolov8n-static.onnx")
IMAGE_SIZE = 640


def shape_values(value):
    dimensions = value.type.tensor_type.shape.dim
    return [dimension.dim_param if dimension.dim_param else dimension.dim_value
            for dimension in dimensions]


def export_model(model_path, dynamic, batch):
    return Path(YOLO(str(model_path), verbose=False).export(
        format="onnx",
        imgsz=IMAGE_SIZE,
        batch=batch,
        dynamic=dynamic,
        nms=False,
        simplify=True,
        verbose=False
    ))


def validate_model(path, dynamic_batch):
    model = onnx.load(str(path))
    input_shape = shape_values(model.graph.input[0])
    output_shape = shape_values(model.graph.output[0])
    if dynamic_batch:
        if len(input_shape) != 4 or input_shape[0] in (0, 1):
            raise RuntimeError(f"动态模型输入 Batch 无效: input={input_shape}")
    elif len(input_shape) != 4 or input_shape[0] != 1:
        raise RuntimeError(f"Apple 回退模型必须为 Batch=1: input={input_shape}")
    if len(output_shape) != 3 or (dynamic_batch and output_shape[0] in (0, 1)) or output_shape[1] != 84:
        raise RuntimeError(f"输出维度不符合当前 Rust 解析器: {output_shape}")
    return input_shape, output_shape


def main():
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(f"模型权重不存在: {MODEL_PATH}")
    with tempfile.TemporaryDirectory(prefix="lian-yolo-static-") as temp_dir:
        static_model_path = Path(temp_dir) / MODEL_PATH.name
        shutil.copy2(MODEL_PATH, static_model_path)
        static_exported_path = export_model(static_model_path, dynamic=False, batch=1)
        shutil.copy2(static_exported_path, STATIC_ONNX_PATH)
    dynamic_exported_path = export_model(MODEL_PATH, dynamic=True, batch=32)
    input_shape, output_shape = validate_model(dynamic_exported_path, dynamic_batch=True)
    static_input_shape, static_output_shape = validate_model(STATIC_ONNX_PATH, dynamic_batch=False)
    print(f"已导出动态模型: {dynamic_exported_path}")
    print(f"输入维度: {input_shape}")
    print(f"输出维度: {output_shape}")
    print(f"已导出 Apple 回退模型: {STATIC_ONNX_PATH}")
    print(f"输入维度: {static_input_shape}")
    print(f"输出维度: {static_output_shape}")


if __name__ == "__main__":
    main()
