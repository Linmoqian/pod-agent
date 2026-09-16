import type { Metadata } from "next";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Pod Agent · 智慧育种，从一次对话开始",
    template: "%s · Pod Agent"
  },
  description:
    "Pod Agent 是面向大豆育种的本地科研助手，把研究问题、数据处理与可追溯结果放进同一个工作空间。",
  icons: {
    icon: "/favicon.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
