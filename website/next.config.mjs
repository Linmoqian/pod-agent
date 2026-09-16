import createMDX from "@next/mdx";
const withMDX = createMDX({
  options: {
    // 使用包名而不是已加载的函数，确保 Next 16 Turbopack 的 loader options 可序列化。
    remarkPlugins: ["remark-gfm"],
    rehypePlugins: ["rehype-highlight"]
  }
});

const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  agentRules: false,
  pageExtensions: ["ts", "tsx", "md", "mdx"]
};

export default withMDX(nextConfig);
