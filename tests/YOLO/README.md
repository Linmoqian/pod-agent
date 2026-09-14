# YOLO 推理与解析测试

`yolo_infer.py` 保留原有逐框演示；Agent 使用 `yolo_tool.py`，仅输出过滤后的计数 JSON，日志写入 stderr，不保存或覆盖原图。

解析器测试（无需 ultralytics）：

```bash
conda run -n base python tests/YOLO/test_yolo_tool.py
```

实际推理需要选定 conda 环境安装 ultralytics，并通过 `YOLO_PYTHON` 指向该环境解释器。当前未自动安装依赖。
