# YOLO 服务端示例
import socket

TCP_IP = "0.0.0.0" #简单局域网内
TCP_PORT = 5005


def run_server():
    server = socket.socket(
        socket.AF_INET,
        socket.SOCK_STREAM
    )

    # 允许程序重启后立即重新绑定端口
    server.setsockopt(
        socket.SOL_SOCKET,
        socket.SO_REUSEADDR,
        1
    )

    server.bind((TCP_IP, TCP_PORT))
    server.listen(1)

    print(f"Server listening on {TCP_IP}:{TCP_PORT}")

    while True:
        # 等待 YOLO 客户端连接
        conn, addr = server.accept()

        print(f"\nClient connected: {addr}")

        buffer = ""

        try:
            while True:
                data = conn.recv(4096)

                if not data:
                    print(f"Client disconnected: {addr}")
                    break

                # 查看原始二进制数据
                print(f"RAW: {data}")

                # 解码
                buffer += data.decode("utf-8")

                # 每条消息使用 \n 分隔
                while "\n" in buffer:
                    message, buffer = buffer.split("\n", 1)

                    if message:
                        print(f"YOLO: {message}")

        except ConnectionResetError:
            print(f"Client connection reset: {addr}")

        finally:
            conn.close()


if __name__ == "__main__":
    run_server()