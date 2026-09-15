# tools

点云数据转换工具。需要 torch 环境（如 conda env `seed`）。

## .pth → PLY

测试数据集（`测试大豆点云集/`）为 PyTorch 格式，每株 70000 点：
`tuple(xyz, normal, 语义标签1-3, 实例标签1-N)`，无 RGB。

```bash
# 语义标签三色（茎/叶/荚）
python tools/pth2ply.py 测试大豆点云集/train/xxx.pth -o public/ply --color-by label2

# 实例分割多色
python tools/pth2ply.py 测试大豆点云集/train/xxx.pth -o public/ply --color-by label3
```

输出到 `public/ply/`（已 gitignore），Viewer 内可通过
`http://localhost:5183/?src=/ply/xxx.ply&mode=rgb|height` 直达预览。
