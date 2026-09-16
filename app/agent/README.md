# lian 受控 Agent 进程

Agent 由 Rust 惰性启动为单一常驻 Node 进程。Node 进程按 `conversationId` 保存内存会话：`discuss` 复用会话，`plan` 每次创建无工具的一次性 Agent；同一会话串行、不同会话可并发。SQLite 是唯一持久化真相，进程重启后由 Rust 下发最近 12 条消息恢复，不创建 Pi 磁盘 session 文件。

开发态可以复制 `.env.example` 为 `.env` 并设置 `MODEL_PROVIDER`、`MODEL_ID` 与对应 Provider 的 API Key。发行版必须由前端显式选择模型；API Key 由 Rust 从 macOS Keychain 注入 stdin，Node 只在内存中使用。

## 协议 v2

协议是严格 LF-JSONL：每行一个 JSON 对象，Node 使用显式 UTF-8 缓冲区只按 `\n` 分帧；空行忽略，U+2028/U+2029 仍属于 JSON 字符串内容。每个 prompt 必须最终依次产生 `result`、`settled`，`settled` 是该请求最后一条消息。

Rust → Node：

```json
{"protocol":2,"type":"prompt","requestId":"uuid","conversationId":"uuid","mode":"discuss","model":{"providerId":"openai","modelId":"gpt-4o"},"history":[],"context":{},"message":"..."}
{"protocol":2,"type":"abort","requestId":"uuid"}
{"protocol":2,"type":"session.reset","conversationId":"uuid"}
{"protocol":2,"type":"shutdown"}
```

Node → Rust：

```json
{"protocol":2,"type":"ready","capabilities":{"sessions":true,"abort":true}}
{"protocol":2,"type":"accepted","requestId":"uuid"}
{"protocol":2,"type":"event","requestId":"uuid","conversationId":"uuid","eventType":"reply.delta","kind":"text","delta":"..."}
{"protocol":2,"type":"result","requestId":"uuid","ok":true,"reply":"...","model":"openai/gpt-4o"}
{"protocol":2,"type":"settled","requestId":"uuid","status":"succeeded"}
```

取消会调用 Pi `Agent.abort()`，并沿工具 `AbortSignal` 传给 Python/YOLO；5 秒内未收到终态时 Rust 强制重启子进程。进程崩溃时当前 pending 请求返回 `AGENT_PROCESS_EXITED`，下一次请求自动重启并从 SQLite 恢复。

`plan` 不加载工具；`discuss` 提供 `list_yolo_models`、`run_yolo_detection` 与 `run_yolo_batch_detection`，没有通用命令或数据库工具。

## YOLO 模型清单

### 常驻 ONNX 后端

桌面 Rust 进程首次调用 Agent 时启动本机推理服务，使用随机端口和随机凭据，不对外网监听。Agent 从父进程接收连接信息，不将凭据写入工具输出。服务随桌面进程退出，不额外启动 Python 或 Rust 子进程。

`run_yolo_detection` 默认 `backend: "onnx"`；Python 调用必须显式传 `backend: "python"`，不自动降级。清单 `backends.onnx` 表示已连接服务且权重存在，不代表模型已验证。

当用户明确提供一批图片或图片文件夹时，Agent 使用 `run_yolo_batch_detection`，递归读取用户给出的绝对路径，并按最多 64 张一批调用常驻 ONNX 服务。每张图片的排队、运行、完成或失败事件会同步到育种台任务列表；工具回复只包含汇总计数，不把图片路径和检测框带入模型上下文。单次最多读取 10,000 张图片；空文件夹和无效路径会明确报错。

ONNX 清单额外要求 `onnxPath`、`inputSize`、按训练类别 ID 排序的 `classes`。当前支持单图 RGB、float32、YOLOv8 detect 的 `[1, 4+C, N]` 原始输出（`nms=False`），不支持分割、姿态或端到端 NMS 模型。先 letterbox，再归一化为 NCHW，分类 NMS 阈值 0.45、最多 300 个检测；数量是检测估计。

服务串行处理推理，最多保留一个模型会话；相同权重复用，切换模型或文件时间/大小变化时重新加载。客户端超时/取消会停止等待，但已进入 ONNX 的推理仍会完成，不宣称支持中途抢占。

验证常驻缓存（需要仓库 ONNX 文件）：

```bash
cd app/src-tauri
cargo test --lib services::yolo::tests
cargo test --lib services::yolo::tests::real_model_reuses_session -- --ignored --nocapture
```

`check_python_environment` 只读检查当前配置的 Python 版本、conda 状态和依赖包是否存在，不自动安装，也不扫描个人环境文件。检查通过不保证原生依赖可成功加载，实际推理仍需验证。

探头还通过 conda 枚举环境，以最多两个并发进程尝试导入 ultralytics，每次超时 30 秒。返回 `discovery.environments` 中的 `environmentName`、`available` 和版本。检测调用可传 `environmentName`，工具重新解析该名称并直接启动对应解释器，不需要 `conda activate`；未知或重名环境拒绝执行。导入失败或超时不等于库一定未安装。

维护 `tools/yolo-models.json`，每项含唯一 `id`、`name`、`path`、`description`。权重路径相对于仓库根目录，也支持绝对路径（个人路径勿提交）。仅登记可信的本地权重，不自动下载模型。

先调用 `list_yolo_models` 查看用途与权重可用性，再调用：

```json
{"imagePath":"/path/to/photo.jpg","modelId":"yolov8n-coco","backend":"onnx","targetClass":"person","minConfidence":0.5}
```

`modelId` 必填，未知 ID 拒绝执行，不回退默认模型。`targetClass` 使用权重原始类别名；省略则按类别计数。内置 COCO 模型不支持豆荚，需登记真实豆荚专用权重后使用。

批量调用示例：

```json
{"folderPath":"/path/to/images","modelId":"yolov8n-coco","targetClass":"person","minConfidence":0.5}
```

设置 `YOLO_PYTHON` 为已安装 ultralytics 的 conda 环境解释器，默认使用 PATH 中的 `python`。模型清单中的 `available` 只表示权重存在，不代表 Python 依赖已就绪。

Python 推理结果先经过类别与置信度过滤，Agent 仅收到模型 ID、阈值、状态和计数结论；不包含逐框结果、图片路径或日志。检测数量是模型估计，不是人工真值。

开发态 bundle 验证：

```bash
pnpm build:agent
pnpm fetch:node-runtime -- --arch=arm64
pnpm fetch:node-runtime -- --arch=arm64 --check
```

macOS 发行资源由 `build:agent` 生成单一 ESM bundle，并由 `fetch:node-runtime` 下载并校验官方 Node.js v24.21.0 arm64/x64 tarball；Python/Conda 不随包分发。
