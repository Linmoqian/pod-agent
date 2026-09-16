# YOLO 推理与解析测试

`yolo_infer.py` 保留原有逐框演示；Agent 使用 `yolo_tool.py`，仅输出过滤后的计数 JSON，日志写入 stderr，不保存或覆盖原图。

解析器测试（无需 ultralytics）：

```bash
conda run -n base python tests/YOLO/test_yolo_tool.py
```

实际推理需要选定 conda 环境安装 ultralytics，并通过 `YOLO_PYTHON` 指向该环境解释器。当前未自动安装依赖。

动态 Batch ONNX 导出（需要当前 Conda 环境已安装 `ultralytics` 与 `onnx`；同时生成 Apple CoreML 的 Batch=1 回退模型）：

```bash
python tests/YOLO/export_dynamic_onnx.py
```

Rust ONNX 100 张吞吐基准（使用仓库中的真实测试图片与 ONNX 权重）：

```bash
LIAN_YOLO_PERF_LOG=/tmp/pod-agent-yolo-perf.log \
  cargo test --release --manifest-path app/src-tauri/Cargo.toml --lib \
  services::yolo::tests::benchmark_100_images_throughput -- --ignored --nocapture
```

设置 `LIAN_YOLO_PERF_LOG` 后会记录模型加载、预处理、动态 Batch 回退、单张推理、后处理、纯推理总耗时和缩略图耗时；不设置时不会增加常规运行日志。

macOS 缩略图通过 `QuickLookThumbnailing` 原生 API 获取，失败时回退到应用内图片解码；Apple 平台使用 Batch=1 回退 ONNX，CPU/NVIDIA 平台使用动态 Batch ONNX。
