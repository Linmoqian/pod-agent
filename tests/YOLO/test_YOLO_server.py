from ultralytics import YOLO
import socket
import json

TCP_IP = "127.0.0.1"
TCP_PORT = 5005

MODEL_PATH = "./yolov8n.pt"
SOURCE = 0

model = YOLO(MODEL_PATH)


def run_yolo_and_send():

    sock = socket.socket(
        socket.AF_INET,
        socket.SOCK_STREAM
    )

    sock.connect((TCP_IP, TCP_PORT))

    # stream=True：逐帧获取结果
    results = model.predict(
        source=SOURCE,
        imgsz=640,
        conf=0.25,
        stream=True,
        show=False
    )

    try:

        for result in results:
            detections = []
            for box in result.boxes:
                detections.append({
                    "class_id": int(box.cls[0]),
                    "class_name": model.names[int(box.cls[0])],
                    "confidence": float(box.conf[0]),
                    "bbox": box.xyxy[0].tolist()
                })
            message = json.dumps(
                detections,
                ensure_ascii=False
            )
            sock.sendall(
                (message + "\n").encode("utf-8")
            )
    finally:
        sock.close()


run_yolo_and_send()