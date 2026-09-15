# PLY 二进制写入与调色公共实现（pth2ply / mvs2ply 共用）

import colorsys
from pathlib import Path

import numpy as np

VERTEX_DTYPE = np.dtype([
    ("x", "f4"), ("y", "f4"), ("z", "f4"),
    ("nx", "f4"), ("ny", "f4"), ("nz", "f4"),
    ("red", "u1"), ("green", "u1"), ("blue", "u1"),
    ("label2", "u1"), ("label3", "u1"),
])

# 字段名 → PLY property 类型
FIELD_TYPES = {
    "x": "float", "y": "float", "z": "float",
    "nx": "float", "ny": "float", "nz": "float",
    "red": "uchar", "green": "uchar", "blue": "uchar",
    "label2": "uchar", "label3": "uchar",
}


def write_binary_ply(out_path: Path, vertex: np.ndarray) -> None:
    # 手写 binary_little_endian PLY：header + 原始结构体字节
    n = vertex.shape[0]
    header = "\n".join(
        [
            "ply",
            "format binary_little_endian 1.0",
            f"comment soybean point cloud, {n} points",
            f"element vertex {n}",
        ]
        + [f"property {FIELD_TYPES[name]} {name}" for name in vertex.dtype.names]
        + ["end_header"]
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(header.encode("ascii") + b"\n")
        f.write(vertex.view(np.uint8).reshape(-1).tobytes())


def instance_color(idx: int) -> tuple[int, int, int]:
    # 实例标签用黄金角色相循环，明度饱和度固定，视觉区分度高
    h = (idx * 0.618_033_988_7) % 1.0
    r, g, b = colorsys.hsv_to_rgb(h, 0.72, 0.92)
    return (int(r * 255), int(g * 255), int(b * 255))


def make_vertex(
    xyz: np.ndarray,
    colors: np.ndarray,
    label2: np.ndarray,
    label3: np.ndarray,
    normal: np.ndarray | None = None,
) -> np.ndarray:
    # 打包为 PLY 顶点结构体；无法线时填 0
    n = xyz.shape[0]
    vertex = np.empty(n, dtype=VERTEX_DTYPE)
    vertex["x"], vertex["y"], vertex["z"] = xyz[:, 0], xyz[:, 1], xyz[:, 2]
    if normal is not None:
        vertex["nx"], vertex["ny"], vertex["nz"] = normal[:, 0], normal[:, 1], normal[:, 2]
    vertex["red"], vertex["green"], vertex["blue"] = colors[:, 0], colors[:, 1], colors[:, 2]
    vertex["label2"], vertex["label3"] = label2, label3
    return vertex
