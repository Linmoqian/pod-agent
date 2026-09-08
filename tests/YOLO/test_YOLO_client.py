# YOLO 客户端示例
import socket

TCP_IP = "127.0.0.1"
TCP_PORT = 5005


def receive_yolo_data():
    """连接 YOLO 服务端，只打印接收到的数据"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        # 连接服务端
        sock.connect((TCP_IP, TCP_PORT))
        print(f"Connected to {TCP_IP}:{TCP_PORT}")

        while True:
            # 每次最多接收 4096 字节
            data = sock.recv(4096)

            # 服务端断开连接
            if not data:
                print("Server disconnected")
                break

            # 原始 bytes
            print(f"RAW: {data}")

            # UTF-8 解码后的内容
            try:
                message = data.decode("utf-8")
                print(f"DATA: {message}")
            except UnicodeDecodeError:
                print("DATA: <无法使用 UTF-8 解码>")

    except ConnectionRefusedError:
        print(f"无法连接到 {TCP_IP}:{TCP_PORT}")

    finally:
        sock.close()


receive_yolo_data()