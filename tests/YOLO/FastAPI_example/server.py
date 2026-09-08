# FastAPI 的服务端的示例
from fastapi import FastAPI, UploadFile, File
from ultralytics import YOLO

import numpy as np
import cv2

app = FastAPI()

MODEL_PATH = "./yolov8n.pt"

model = YOLO(MODEL_PATH)

# 定义请求路由
@app.post("/predict")
async def predict(file: UploadFile = File(...)):

    # 读拿去客户端传来的图片
    image_bytes = await file.read()

    image = cv2.imdecode(
        np.frombuffer(image_bytes, np.uint8),
        cv2.IMREAD_COLOR
    )

    # YOLO 推理
    results = model.predict(
        source=image,
        imgsz=640,
        conf=0.25,
        verbose=False
    )

    detections = []

    for result in results:
        for box in result.boxes:

            class_id = int(box.cls[0])

            detections.append({
                "class_id": class_id,
                "class_name": model.names[class_id],
                "confidence": float(box.conf[0]),
                "bbox": box.xyxy[0].tolist()
            })

    return {
        "count": len(detections),
        "detections": detections
    }