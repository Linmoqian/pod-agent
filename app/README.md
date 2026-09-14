# Pod Agent · 桌面端（app/）

Tauri 2 + React 19 + TypeScript + Vite。前端负责界面，Rust 负责桌面边界与领域逻辑；Rust 是业务数据的事实来源。

规范依据：[前端开发](../docs/development/frontend.md)、[Rust 与 Tauri](../docs/development/rust.md)。

## 目录结构

目录边界已初始化；尚无实现的边界目录以 `.gitkeep` 保留，新增功能时在所属目录内落地。

```text
app/
├── index.html
├── package.json
├── vite.config.ts          # Vite + Vitest 配置
├── eslint.config.js
├── public/                 # 静态资源
├── src/                    # 前端源码
│   ├── components/
│   │   └── common/         # 跨 feature 复用组件（≥2 个 feature 稳定复用才提升）
│   ├── features/
│   │   └── chat/           # 聊天业务域
│   │       ├── components/ # MarkdownContent 等私有组件
│   │       ├── hooks/
│   │       ├── services/
│   │       ├── store/      # 该功能的 Redux Toolkit slice
│   │       └── types.ts
│   ├── layouts/            # 布局壳（自定义标题栏 + 侧边栏等）
│   ├── routes/             # 页面组装，只做组装不堆积业务
│   ├── services/           # 基础服务（如 Rust IPC 封装）
│   ├── store/              # Redux Toolkit 全局 store
│   ├── styles/             # 全局样式与主题（global.css）
│   ├── test/               # 测试基础设施（Vitest setup）
│   ├── utils/              # 纯工具函数
│   ├── App.tsx             # 应用根组件
│   └── main.tsx            # 入口
└── src-tauri/              # Rust 桌面端
    ├── src/
    │   ├── commands/       # Tauri IPC 边界：输入校验、调领域/服务、转 DTO
    │   ├── domain/         # 领域模型与核心规则，不依赖 Tauri
    │   ├── services/       # 文件、系统、网络等外部能力
    │   ├── state/          # 共享运行时状态
    │   ├── dto/            # IPC 数据结构，与领域类型分离
    │   ├── lib.rs          # 仅启动与模块组装
    │   └── main.rs
    ├── capabilities/       # 权限最小授权
    └── tests/              # Rust 集成测试
```

依赖方向：`features → components/common / 基础层`，共用层不得反向依赖 feature；Rust 侧 `commands → domain / services / state`，`domain` 不依赖 Tauri。

## 构建与开发命令

包管理器为 pnpm（与 `tauri.conf.json` 的 `beforeDevCommand` 一致）。

| 命令 | 作用 |
| --- | --- |
| `pnpm install` | 安装前端依赖 |
| `pnpm tauri:dev` | 桌面应用开发模式（热加载前后端） |
| `pnpm dev:agent` | 单独启动本地 Agent 进程（终端流式对话） |
| `pnpm tauri:build` | 构建发布版安装包 |
| `pnpm dev` | 仅启动前端 Vite 开发服务器 |
| `pnpm build` | 前端类型检查 + 产物构建 |
| `pnpm test` | 前端单测（监听模式） |
| `pnpm test:run` | 前端单测（单次执行，CI 用） |
| `pnpm lint` | ESLint 检查 |
| `pnpm check:react-stack` | 检查 React 单一运行时与冲突技术栈入口 |
| `pnpm format` | Prettier 格式化 |

Rust 侧验证在 `src-tauri/` 下执行：

```powershell
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

## 技术选型与取舍

- 当前界面主栈为 `radix-ui` + shadcn/ui 组件模式、Tailwind CSS 4、CSS Modules、`lucide-react`、`react-router`（桌面端使用 `MemoryRouter`）和 `motion`。
- 全局工作流状态使用 `@reduxjs/toolkit` + `react-redux`；局部状态优先使用 React Hooks。Rust/Tauri IPC 是业务数据事实来源，前端不维护第二份业务真相。
- Markdown 链路为 `react-markdown` + `remark-gfm`（表格/删除线）+ `rehype-highlight` + `highlight.js`（代码高亮，显式声明以控版本）。
- `@tanstack/react-query`、`@tanstack/react-table`、`react-hook-form`、`recharts`、`@xyflow/react`、`@react-three/fiber`、`@react-three/drei` 与 Monaco 组合保留作未来能力，不因为当前未接线而删除。
- 依赖边界由 `pnpm.overrides` 固定 React/ReactDOM 单一运行时；`pnpm check:react-stack` 检查锁文件版本和源码入口，避免重新接入历史上的 Ant Design、TanStack Router、Zustand 或 ECharts 栈。
- `@react-three/fiber` 与 `@xyflow/react` 当前分别带入 Zustand 5 / 4，这是上游包的传递依赖约束；业务代码不直接导入 Zustand，也不强行 override，待上游兼容同一主版本后再合并。
- 锁文件中的 `react-is@17` 仅由测试工具 `pretty-format` 引入，生产图表链路使用 `react-is@19`，不属于第二份 React 运行时。
- Lint 采用 ESLint 9 flat config + typescript-eslint + Prettier。规范提及的 Airbnb 风格配置不支持 ESLint 9 flat config 且维护停滞，故以 typescript-eslint 推荐规则 + Prettier 近似覆盖其核心约束（可读性、一致格式），并保留规范要求的 `max-lines` / `max-lines-per-function` warning 提示。
- `tauri-plugin-opener` 已按最小授权原则移除，出现打开外部链接需求时再评估引入。
- Markdown 内容当前来源于自有 LLM 回复，暂未接入 `rehype-sanitize`；若后续渲染用户输入的任意 Markdown，需先补消毒层。
