# YOLO 客户端示例
# yolo_sender.py
from ultralytics import YOLO
import socket
import json

TCP_IP = "127.0.0.1" # 指向本机
TCP_PORT = 5005

MODEL_PATH = "./yolov8n.pt"
SOURCE = 0

model = YOLO(MODEL_PATH)


def run_yolo_and_send():

    # 创建 TCP 连接
    sock = socket.socket(
        socket.AF_INET,
        socket.SOCK_STREAM
    )

    sock.connect((TCP_IP, TCP_PORT))

    print(f"Connected to {TCP_IP}:{TCP_PORT}")

    # 摄像头连续推理
    results = model.predict(
        source=SOURCE,
        imgsz=640,
        conf=0.25,
        stream=True,
        show=True,
        verbose=False
    )

    try:
        for result in results:

            detections = []

            for box in result.boxes:

                class_id = int(box.cls[0])

                detections.append({
                    "class_id": class_id,
                    "class_name": model.names[class_id],
                    "confidence": float(box.conf[0]),
                    "bbox": box.xyxy[0].tolist()
                })

            # Python 对象 → JSON 字符串
            message = json.dumps(
                detections,
                ensure_ascii=False
            )

            # 每条 JSON 后面添加 \n 作为结束标志
            sock.sendall(
                (message + "\n").encode("utf-8")
            )

    except KeyboardInterrupt:
        print("YOLO stopped")

    finally:
        sock.close()


if __name__ == "__main__":
    run_yolo_and_send()