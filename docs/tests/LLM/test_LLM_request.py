# 一次LLM的对话
import os
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI

# 读取当前 Python 文件同目录下的 .env
load_dotenv(Path(__file__).with_name(".env"))

client = OpenAI(
    api_key=os.getenv("api_key"),
    base_url="https://api.deepseek.com"
)

response = client.chat.completions.create(
    model="deepseek-v4-flash",
    messages=[
        {"role": "system", "content": "你是大豆育种助手"},
        {"role": "user", "content": "你好啊"},
    ],
    stream=True,
    reasoning_effort="none",
)

# 流式打印
for chunk in response:
    content = chunk.choices[0].delta.content
    if content:
        print(content, end="", flush=True)

print()