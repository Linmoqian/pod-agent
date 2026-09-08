# 演示用户的消息的发送和接收
import socket

TCP_IP = "127.0.0.1"
TCP_PORT = 5005


def send_message(message: str):
    sock = socket.socket(
        socket.AF_INET,
        socket.SOCK_STREAM
    )

    try:
        # 连接服务端
        sock.connect((TCP_IP, TCP_PORT))
        print(f"用户: {message}")
        # 发送消息
        sock.sendall(
            message.encode("utf-8")
        )
        # 接收服务端回复
        response = ""
        while True:
            data = sock.recv(4096)

            if not data:
                break
            
            text = data.decode("utf-8")
            response += text

            # 实时输出
            print(text, end="", flush=True)

        print()

        return response

    finally:
        sock.close()


if __name__ == "__main__":
    send_message("我是你爹啊")