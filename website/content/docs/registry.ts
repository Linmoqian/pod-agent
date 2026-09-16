import type { ComponentType } from "react";

import Architecture from "./architecture.mdx";
import Development from "./development.mdx";
import Quickstart from "./quickstart.mdx";

export type DocSlug = "quickstart" | "architecture" | "development";

type DocComponent = ComponentType<Record<string, never>>;

export type DocEntry = {
  slug: DocSlug;
  title: string;
  kicker: string;
  description: string;
  readTime: string;
  Component: DocComponent;
};

export const docEntries: readonly DocEntry[] = [
  {
    slug: "quickstart",
    title: "快速开始",
    kicker: "GETTING STARTED",
    description: "从站点本地开发到桌面端首次运行，了解 Pod Agent 的启动顺序与安全边界。",
    readTime: "5 分钟",
    Component: Quickstart
  },
  {
    slug: "architecture",
    title: "系统架构",
    kicker: "ARCHITECTURE",
    description: "理解 React、Tauri Rust、Node Agent、Python / ONNX 与 SQLite 之间的职责分界。",
    readTime: "8 分钟",
    Component: Architecture
  },
  {
    slug: "development",
    title: "开发指南",
    kicker: "DEVELOPMENT",
    description: "查找目录职责、日常命令、接口变更原则，以及提交前需要留意的维护约束。",
    readTime: "7 分钟",
    Component: Development
  }
];

export function findDoc(slug: string): DocEntry | undefined {
  return docEntries.find((entry) => entry.slug === slug);
}
