# 大豆 .pth 点云 → 二进制 PLY 转换工具（供 Web Viewer 预览）
# 数据结构: tuple(xyz(70000,3), normal(70000,3), 语义标签(70000,), 实例标签(70000,))

import argparse
import colorsys
from pathlib import Path

import numpy as np
import torch

# 语义标签调色板（1-3 类，按索引取色）
LABEL2_PALETTE = [
    (224, 90, 78),    # 1 -> 红
    (76, 175, 109),   # 2 -> 绿
    (74, 144, 217),   # 3 -> 蓝
]

VERTEX_DTYPE = np.dtype([
    ("x", "f4"), ("y", "f4"), ("z", "f4"),
    ("nx", "f4"), ("ny", "f4"), ("nz", "f4"),
    ("red", "u1"), ("green", "u1"), ("blue", "u1"),
    ("label2", "u1"), ("label3", "u1"),
])


def instance_color(idx: int) -> tuple[int, int, int]:
    # 实例标签用黄金角色相循环，明度饱和度固定，视觉区分度高
    h = (idx * 0.618_033_988_7) % 1.0
    r, g, b = colorsys.hsv_to_rgb(h, 0.72, 0.92)
    return (int(r * 255), int(g * 255), int(b * 255))


def write_binary_ply(out_path: Path, vertex: np.ndarray) -> None:
    # 手写 binary_little_endian PLY：header + 原始结构体字节
    n = vertex.shape[0]
    header_lines = [
        "ply",
        "format binary_little_endian 1.0",
        f"comment soybean point cloud, {n} points",
        "element vertex",
    ]
    field_names = {
        "x": "float", "y": "float", "z": "float",
        "nx": "float", "ny": "float", "nz": "float",
        "red": "uchar", "green": "uchar", "blue": "uchar",
        "label2": "uchar", "label3": "uchar",
    }
    header = "\n".join(
        header_lines[:3]
        + [f"element vertex {n}"]
        + [f"property {field_names[name]} {name}" for name in vertex.dtype.names]
        + ["end_header"]
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(header.encode("ascii") + b"\n")
        f.write(vertex.view(np.uint8).reshape(-1).tobytes())


def convert(pth_path: Path, out_path: Path, color_by: str) -> None:
    data = torch.load(pth_path, map_location="cpu", weights_only=False)
    xyz = data[0].astype(np.float32)
    normal = data[1].astype(np.float32)
    label2 = data[2].astype(np.uint8)
    label3 = data[3].astype(np.uint8)

    n = xyz.shape[0]
    colors = np.zeros((n, 3), dtype=np.uint8)
    if color_by == "label2":
        for i, rgb in enumerate(LABEL2_PALETTE, start=1):
            colors[label2 == i] = rgb
    elif color_by == "label3":
        palette = np.array([instance_color(i) for i in range(int(label3.max()) + 1)])
        colors = palette[label3]

    vertex = np.empty(n, dtype=VERTEX_DTYPE)
    vertex["x"], vertex["y"], vertex["z"] = xyz[:, 0], xyz[:, 1], xyz[:, 2]
    vertex["nx"], vertex["ny"], vertex["nz"] = normal[:, 0], normal[:, 1], normal[:, 2]
    vertex["red"], vertex["green"], vertex["blue"] = colors[:, 0], colors[:, 1], colors[:, 2]
    vertex["label2"], vertex["label3"] = label2, label3

    write_binary_ply(out_path, vertex)
    print(f"{pth_path.name} -> {out_path}  {n} 点  着色={color_by}  尺寸={out_path.stat().st_size / 1e6:.1f}MB")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="pth 点云转 PLY")
    parser.add_argument("inputs", nargs="+", help=".pth 文件路径")
    parser.add_argument("-o", "--out-dir", default="public/ply", help="输出目录")
    parser.add_argument("--color-by", choices=["label2", "label3", "none"], default="label2")
    args = parser.parse_args()

    for src in args.inputs:
        src_path = Path(src)
        out = Path(args.out_dir) / (src_path.stem + ".ply")
        convert(src_path, out, args.color_by)
