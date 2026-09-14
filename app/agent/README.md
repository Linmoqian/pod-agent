# lian 受控 Agent 进程

复制 `.env.example` 为 `.env` 并填写模型配置。该进程接受 Rust 发送的两种 JSONL 请求：

- `plan`：结构化计划建议（同 V1）；
- `discuss`：自由讨论，回复 Markdown；上下文里明确声明当前拥有/没有的数据，禁止虚构。

`plan` 不加载工具；`discuss` 提供 `list_yolo_models` 与 `run_yolo_detection`，没有通用命令或数据库工具。

## YOLO 模型清单

### 常驻 ONNX 后端

桌面 Rust 进程首次调用 Agent 时启动本机推理服务，使用随机端口和随机凭据，不对外网监听。Agent 从父进程接收连接信息，不将凭据写入工具输出。服务随桌面进程退出，不额外启动 Python 或 Rust 子进程。

`run_yolo_detection` 默认 `backend: "onnx"`；Python 调用必须显式传 `backend: "python"`，不自动降级。清单 `backends.onnx` 表示已连接服务且权重存在，不代表模型已验证。

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

设置 `YOLO_PYTHON` 为已安装 ultralytics 的 conda 环境解释器，默认使用 PATH 中的 `python`。模型清单中的 `available` 只表示权重存在，不代表 Python 依赖已就绪。

Python 推理结果先经过类别与置信度过滤，Agent 仅收到模型 ID、阈值、状态和计数结论；不包含逐框结果、图片路径或日志。检测数量是模型估计，不是人工真值。

开发握手验证：

```bash
pnpm run dev:agent < /dev/null
```
