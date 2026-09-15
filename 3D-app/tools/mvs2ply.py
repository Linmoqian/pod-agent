# SoybeanMVS txt 点云（Annotations 按器官拆分）→ 二进制 PLY，供 Web Viewer 预览
# txt 格式: 每行 "x y z r g b"（0-255 RGB）

import argparse
import re
from pathlib import Path

import numpy as np

from ply_io import instance_color, make_vertex, write_binary_ply

# 器官类别基色（叶实例间做明度变化以区分）
ORGAN_COLORS = {
    "mainstem": (110, 90, 58),
    "stem": (140, 160, 70),
    "petiole": (100, 150, 90),
    "leaf": (52, 130, 55),
    "pod": (150, 168, 84),
}
FALLBACK_COLOR = (160, 160, 160)

NAME_RE = re.compile(r"^(?P<organ>[a-zA-Z]+)_(?P<idx>\d+)\.txt$")


def shade(rgb: tuple[int, int, int], factor: float) -> tuple[int, int, int]:
    return tuple(min(255, max(0, int(c * factor))) for c in rgb)


def convert(plant_dir: Path, out_path: Path, color_by: str) -> None:
    ann_dir = plant_dir / "Annotations"
    txt_files = sorted(ann_dir.glob("*.txt"))
    if not txt_files:
        raise FileNotFoundError(f"{ann_dir} 下没有 txt 标注")

    chunks_xyz: list[np.ndarray] = []
    chunks_rgb: list[np.ndarray] = []
    label2_list: list[np.ndarray] = []
    label3_list: list[np.ndarray] = []
    organ_stats: dict[str, int] = {}

    for i, txt in enumerate(txt_files, start=1):
        m = NAME_RE.match(txt.name)
        if not m:
            continue
        organ, inst = m.group("organ"), int(m.group("idx"))
        arr = np.loadtxt(txt, dtype=np.float32)
        if arr.ndim != 2 or arr.shape[1] < 3:
            continue
        n = arr.shape[0]
        xyz = arr[:, :3]
        raw_rgb = arr[:, 3:6] if arr.shape[1] >= 6 else np.full((n, 3), 160, np.float32)

        if color_by == "rgb":
            # 原始颜色；若疑似 0-1 浮点则放大（防御）
            rgb = raw_rgb * 255 if raw_rgb.max() <= 1.0 else raw_rgb
        elif color_by == "instance":
            rgb = np.tile(np.array(instance_color(i), np.float32), (n, 1))
        else:  # organ：类别基色 + 实例明度抖动区分单叶
            base = ORGAN_COLORS.get(organ, FALLBACK_COLOR)
            factor = 0.85 + ((inst * 37) % 30) / 100
            rgb = np.tile(np.array(shade(base, factor), np.float32), (n, 1))

        chunks_xyz.append(xyz)
        chunks_rgb.append(np.clip(rgb, 0, 255))
        # label2=粗分类序号（mainstem/stem 系归 1，叶果类归 2），label3=文件实例号
        label2_list.append(np.full(n, 1 if organ in ("mainstem", "stem", "petiole") else 2, np.uint8))
        label3_list.append(np.full(n, inst, np.uint8))
        organ_stats[organ] = organ_stats.get(organ, 0) + n

    vertex = make_vertex(
        np.concatenate(chunks_xyz).astype(np.float32),
        np.concatenate(chunks_rgb).astype(np.uint8),
        np.concatenate(label2_list),
        np.concatenate(label3_list),
    )
    write_binary_ply(out_path, vertex)
    stats = " ".join(f"{k}:{v}" for k, v in organ_stats.items())
    print(f"{plant_dir.name} -> {out_path}  {vertex.shape[0]} 点  着色={color_by}  [{stats}]")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SoybeanMVS txt 点云转 PLY")
    parser.add_argument("plants", nargs="+", help="株目录（含 Annotations/）")
    parser.add_argument("-o", "--out-dir", default="public/ply", help="输出目录")
    parser.add_argument(
        "--color-by", choices=["organ", "rgb", "instance"], default="organ",
        help="organ=器官类别色（默认），rgb=原始纹理色，instance=实例彩虹色",
    )
    args = parser.parse_args()

    for plant in args.plants:
        plant_dir = Path(plant)
        out = Path(args.out_dir) / f"mvs-{plant_dir.name}.ply"
        convert(plant_dir, out, args.color_by)
