# tools

点云数据转换工具。需要 torch 环境（如 conda env `seed`）。

## 数据源 1：测试大豆点云集/（.pth）

每株 70000 点：`tuple(xyz, normal, 语义标签1-3, 实例标签1-N)`，无 RGB。

```bash
python tools/pth2ply.py 测试大豆点云集/train/xxx.pth -o public/ply --color-by label2
```

## 数据源 2：点云集 2/（SoybeanMVS txt）

每株目录含 `Annotations/*.txt`，按器官实例拆分，格式 `x y z r g b`（0-255）。
类别：`leaf_N` / `mainstem_1` / `stem_N`（部分株含 `petiole`）。

```bash
# 器官类别色（默认，叶实例间明度变化）
python tools/mvs2ply.py 点云集\ 2/20180612_DN251 -o public/ply

# 原始纹理色
python tools/mvs2ply.py 点云集\ 2/20190921_HN51 -o public/ply --color-by rgb

# 实例彩虹色
python tools/mvs2ply.py 点云集\ 2/20180612_DN251 --color-by instance
```

输出带来源前缀（`pth-*` / `mvs-*`），写入 `public/ply/`（已 gitignore）。

## 内置示例（public/examples/，随 git 入库）

```bash
# 苗期样本（语义色，采样 3 万点，870KB）
python tools/pth2ply.py 测试大豆点云集/train/20180612_DN251.pth \
  -o public/examples --color-by label2 --sample 30000
mv public/examples/pth-20180612_DN251.ply public/examples/real-seedling-2018-06.ply

# 成熟期样本（纹理真彩，采样 3 万点）
python tools/mvs2ply.py 点云集\ 2/20190921_HN51 \
  -o public/examples --color-by rgb --sample 30000
mv public/examples/mvs-20190921_HN51.ply public/examples/real-mature-2019-09.ply
```

新示例需同步在 `src/core/examples.ts` 登记元信息。

## Viewer 直达

```text
http://localhost:5183/?src=/ply/mvs-20180612_DN251.ply&mode=rgb|height
```
