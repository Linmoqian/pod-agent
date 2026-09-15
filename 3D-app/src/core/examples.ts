// 内置示例点云清单：public/examples/ 下的精选样本（随构建复制到 dist，URL 运行时可用）

export interface ExampleEntry {
  id: string;
  url: string;
  label: string;
  detail: string;
}

export const EXAMPLES: ExampleEntry[] = [
  {
    id: "real-seedling-2018-06",
    url: "/examples/real-seedling-2018-06.ply",
    label: "真实 · 苗期 DN251",
    detail: "30k · 语义标注色",
  },
  {
    id: "real-mature-2019-09",
    url: "/examples/real-mature-2019-09.ply",
    label: "真实 · 成熟期 HN51",
    detail: "30k · 纹理真彩",
  },
];
