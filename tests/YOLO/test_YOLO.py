# 发起一次 YOLO 的预测测试
from ultralytics import YOLO
import os
import sys

# 获取脚本所在目录
script_dir = sys.path[0]
os.chdir(script_dir)

# 加载 PyTorch 模型
model = YOLO("./yolov8n.pt")

# 转换为 ONNX
model.export(
    format="onnx",
    imgsz=640
)

# 加载 ONNX 模型
model = YOLO("./yolov8n.onnx")

# 调用电脑摄像头进行预测
results = model.predict(
    source=0,
    imgsz=640,
    conf=0.25,
    show=True
)