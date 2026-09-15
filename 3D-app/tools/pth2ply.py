# 大豆 .pth 点云 → 二进制 PLY 转换工具（供 Web Viewer 预览）
# 数据结构: tuple(xyz(70000,3), normal(70000,3), 语义标签(70000,), 实例标签(70000,))

import argparse
from pathlib import Path

import numpy as np
import torch

from ply_io import instance_color, make_vertex, write_binary_ply

# 语义标签调色板（1-3 类，按索引取色）
LABEL2_PALETTE = [
    (224, 90, 78),    # 1 -> 红
    (76, 175, 109),   # 2 -> 绿
    (74, 144, 217),   # 3 -> 蓝
]


def convert(pth_path: Path, out_path: Path, color_by: str, sample: int) -> None:
    data = torch.load(pth_path, map_location="cpu", weights_only=False)
    xyz = data[0].astype(np.float32)
    normal = data[1].astype(np.float32)
    label2 = data[2].astype(np.uint8)
    label3 = data[3].astype(np.uint8)

    n = xyz.shape[0]
    # 均匀随机采样（固定种子），保持形态密度
    if sample and n > sample:
        idx = np.random.default_rng(0).choice(n, sample, replace=False)
        xyz, normal = xyz[idx], normal[idx]
        label2, label3 = label2[idx], label3[idx]
        n = sample
    colors = np.zeros((n, 3), dtype=np.uint8)
    if color_by == "label2":
        for i, rgb in enumerate(LABEL2_PALETTE, start=1):
            colors[label2 == i] = rgb
    elif color_by == "label3":
        palette = np.array([instance_color(i) for i in range(int(label3.max()) + 1)])
        colors = palette[label3]

    vertex = make_vertex(xyz, colors, label2, label3, normal=normal)
    write_binary_ply(out_path, vertex)
    print(f"{pth_path.name} -> {out_path}  {n} 点  着色={color_by}  尺寸={out_path.stat().st_size / 1e6:.1f}MB")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="pth 点云转 PLY")
    parser.add_argument("inputs", nargs="+", help=".pth 文件路径")
    parser.add_argument("-o", "--out-dir", default="public/ply", help="输出目录")
    parser.add_argument("--color-by", choices=["label2", "label3", "none"], default="label2")
    parser.add_argument("--sample", type=int, default=0, help="随机采样点数上限，0=全量")
    args = parser.parse_args()

    for src in args.inputs:
        src_path = Path(src)
        out = Path(args.out_dir) / f"pth-{src_path.stem}.ply"
        convert(src_path, out, args.color_by, args.sample)
