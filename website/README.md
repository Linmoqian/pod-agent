# Pod Agent 官方站

这是与 `app/` 桌面端独立的 Next.js 官方站与开发文档，使用 App Router、MDX 和静态导出，不连接桌面端运行时，也不包含模型凭据或后端服务。

## 本地开发

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:3000` 查看站点。

## 验证与静态导出

```bash
pnpm lint
pnpm typecheck
pnpm build
```

构建结果位于 `out/`，由 Sites 按 `.openai/hosting.json` 的静态目录配置托管。

## 内容维护

- 产品首页位于 `app/page.tsx`。
- 文档注册表位于 `content/docs/registry.ts`。
- 文档正文位于 `content/docs/*.mdx`。
- 品牌资源位于 `public/brand/`。

文档中的桌面端事实应以当前 `app/README.md`、`app/agent/README.md`、实际 Rust 命令注册和 IPC 类型为准；不要在站点中提交密钥、绝对路径、检测框或内部日志。
