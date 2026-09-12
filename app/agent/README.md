# lian 受控计划进程

复制 `.env.example` 为 `.env` 并填写模型配置。该进程只接受 Rust 发送的 JSONL 计划请求，返回结构化计划建议；不提供文件、命令或数据库工具。

开发握手验证：

```bash
pnpm run dev:agent < /dev/null
```
