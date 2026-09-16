# YOLO 推理与解析测试

`yolo_infer.py` 保留原有逐框演示；Agent 使用 `yolo_tool.py`，仅输出过滤后的计数 JSON，日志写入 stderr，不保存或覆盖原图。

解析器测试（无需 ultralytics）：

```bash
conda run -n base python tests/YOLO/test_yolo_tool.py
```

实际推理需要选定 conda 环境安装 ultralytics，并通过 `YOLO_PYTHON` 指向该环境解释器。当前未自动安装依赖。

动态 Batch ONNX 导出（需要当前 Conda 环境已安装 `ultralytics` 与 `onnx`；同时生成 Apple CoreML 的固定 Batch=1 与 Batch=8 模型）：

```bash
python tests/YOLO/export_dynamic_onnx.py
```

Rust ONNX 100 张吞吐基准（使用仓库中的真实测试图片与 ONNX 权重）：

```bash
LIAN_YOLO_PERF_LOG=/tmp/pod-agent-yolo-perf.log \
  cargo test --release --manifest-path app/src-tauri/Cargo.toml --lib \
  services::yolo::tests::benchmark_100_images_throughput -- --ignored --nocapture
```

设置 `LIAN_YOLO_PERF_LOG` 后会记录模型加载、预处理、动态/固定 Batch、单张推理、后处理、纯推理总耗时和缩略图耗时；不设置时不会增加常规运行日志。

批量推理使用 4 个预处理 worker、容量为 4 的有界队列和 32 张推理块；预处理与上一推理块重叠执行，结果按原始图片索引回写。`pipeline.finish` 中的 `prepare_cpu_ms` 是各 worker 预处理耗时之和，`total_ms` 是端到端墙钟时间，不能将两者直接相加。

macOS 缩略图通过 `QuickLookThumbnailing` 原生 API 获取，失败时回退到应用内图片解码；Apple 平台优先使用 Batch=1 回退 ONNX，缺少 Batch=1 权重时使用固定 Batch=8 ONNX，尾批用最后一张图片补齐但不保存补位结果；CPU/NVIDIA 平台使用动态 Batch ONNX。当前 M4 实测 Batch=1 双会话并行吞吐更高，因此 Batch=8 保留为可验证的备用路径。
