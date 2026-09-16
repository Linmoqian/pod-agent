import Link from "next/link";
import { ArrowRight, Clock3, Code2, Layers3 } from "lucide-react";

import { docEntries } from "@/content/docs/registry";
import { DocsShell } from "@/components/DocsShell";

import styles from "./docs.module.css";

export const metadata = {
  title: "开发文档",
  description: "Pod Agent 官方开发文档：快速开始、系统架构与开发指南。"
};

export default function DocsPage() {
  return (
    <DocsShell
      eyebrow="POD AGENT / DOCS"
      title="开发文档"
      description="从第一次运行到理解系统边界，把 Pod Agent 的当前实现读成一条清晰的路径。"
    >
      <div className={styles.docsIntroCard}>
        <div className={styles.docsIntroIcon}>
          <Layers3 size={21} aria-hidden="true" />
        </div>
        <div>
          <span className={styles.cardEyebrow}>A DOCUMENTATION SET</span>
          <h2>先知道它负责什么，再开始扩展。</h2>
          <p>
            Pod Agent 是面向大豆育种的本地桌面科研助手。文档聚焦当前代码里的真实边界：
            工作区、数据事实、受控 Agent、分析工作流和可追溯产物。
          </p>
        </div>
      </div>

      <div className={styles.docEntryList}>
        {docEntries.map((entry, index) => (
          <Link className={styles.docEntry} href={`/docs/${entry.slug}`} key={entry.slug}>
            <div className={styles.docEntryNumber}>0{index + 1}</div>
            <div className={styles.docEntryBody}>
              <span className={styles.cardEyebrow}>{entry.kicker}</span>
              <h2>{entry.title}</h2>
              <p>{entry.description}</p>
              <span className={styles.docEntryMeta}>
                <Clock3 size={13} aria-hidden="true" />
                {entry.readTime}
              </span>
            </div>
            <ArrowRight className={styles.docEntryArrow} size={18} aria-hidden="true" />
          </Link>
        ))}
      </div>

      <div className={styles.docsPrinciples}>
        <div>
          <Code2 size={18} aria-hidden="true" />
          <strong>实现优先</strong>
          <span>以实际命令、DTO、领域模型和前端类型为准。</span>
        </div>
        <div>
          <Layers3 size={18} aria-hidden="true" />
          <strong>职责清楚</strong>
          <span>不同层之间通过明确边界传递事实和动作。</span>
        </div>
      </div>
    </DocsShell>
  );
}
