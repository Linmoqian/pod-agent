import os
import socket

from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI


TCP_IP = "0.0.0.0"
TCP_PORT = 5005

load_dotenv(
    Path(__file__).with_name(".env")
)

client = OpenAI(
    api_key=os.getenv("api_key"),
    base_url="https://api.deepseek.com"
)

def run_server():

    server = socket.socket(
        socket.AF_INET,
        socket.SOCK_STREAM
    )

    server.setsockopt(
        socket.SOL_SOCKET,
        socket.SO_REUSEADDR,
        1
    )

    server.bind((TCP_IP, TCP_PORT))
    server.listen(1)

    print(f"LLM Server: {TCP_IP}:{TCP_PORT}")

    while True:

        # 等待客户端连接
        conn, addr = server.accept()

        print(f"\nClient: {addr}")

        try:

            data = conn.recv(4096)

            if not data:
                continue

            message = data.decode("utf-8")

            print(f"用户: {message}")

            response = client.chat.completions.create(

                model="deepseek-v4-flash",

                messages=[
                    {
                        "role": "system",
                        "content": "你是大豆育种助手"
                    },
                    {
                        "role": "user",
                        "content": message
                    }
                ],

                stream=True,

                reasoning_effort="high",

                extra_body={
                    "thinking": {
                        "type": "enabled"
                    }
                }
            )

            print("LLM: ", end="", flush=True)

            for chunk in response:

                content = chunk.choices[0].delta.content

                if content:

                    # 服务端显示
                    print(
                        content,
                        end="",
                        flush=True
                    )

                    # 发给客户端
                    conn.sendall(
                        content.encode("utf-8")
                    )
            print()

        except Exception as e:
            print(f"Error: {e}")
            conn.sendall(
                f"ERROR: {e}".encode("utf-8")
            )
        finally:

            conn.close()


if __name__ == "__main__":
    run_server()