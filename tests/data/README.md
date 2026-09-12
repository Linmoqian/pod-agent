# 数据与统计测试

在 `lian-breeding-v1` Conda 环境中直接运行：

```bash
python tests/data/test_worker.py
```

脚本使用固定随机种子的临时合成数据，不写入仓库数据目录。

## Dryad 黄金数据集

首个真实验收数据集固定为 [Selection of early soybean inbred lines using multiple indices](https://doi.org/10.5061/dryad.51s498d)：

- Dryad 版本：1，发布日期 2019-06-26；
- 许可证：CC0-1.0；
- 田间数据文件：`field_data.txt`，23,271 B；
- Dryad 提供的 MD5：`702bd0f69abdb2ce8709737341d86b7d`；
- 实验设计：39 个品系、13 个环境、随机完全区组、4 次重复。

原始文件不得提交 Git。下载后先核对 MD5，再通过应用“添加数据”导入；应用会另行计算 SHA-256、保存只读副本并登记来源血缘。2026-09-12 的自动验收环境访问公开下载端点时收到 401/403，因此本轮没有伪造 SHA-256，也没有把未下载的数据标记为已验收。
