import Link from "next/link";
import { ArrowLeft, BookOpen, ChevronDown, ExternalLink } from "lucide-react";

import { docEntries, type DocSlug } from "@/content/docs/registry";

import styles from "@/app/docs/docs.module.css";

type DocsShellProps = {
  currentSlug?: DocSlug;
  eyebrow?: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

export function DocsShell({
  currentSlug,
  eyebrow,
  title,
  description,
  children
}: DocsShellProps) {
  return (
    <div className={styles.docsPage}>
      <div className={styles.docsTopline}>
        <Link className={styles.backLink} href="/">
          <ArrowLeft size={14} aria-hidden="true" />
          返回首页
        </Link>
        <span className={styles.docsRootLabel}>POD AGENT / DOCUMENTATION</span>
        <a
          className={styles.sourceLink}
          href="https://github.com/LianLab-SCAU/LianAgent"
          target="_blank"
          rel="noreferrer"
        >
          源码仓库
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      </div>

      <div className={styles.docsHeading}>
        <span className={styles.docsKicker}>{eyebrow ?? "DOCUMENTATION"}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      <details className={styles.mobileNav}>
        <summary>
          <span>
            <BookOpen size={16} aria-hidden="true" />
            文档导航
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <nav aria-label="移动端文档导航">
          {docEntries.map((entry) => (
            <Link
              className={entry.slug === currentSlug ? styles.currentNavItem : undefined}
              href={`/docs/${entry.slug}`}
              key={entry.slug}
            >
              <span>{entry.title}</span>
              <small>{entry.readTime}</small>
            </Link>
          ))}
        </nav>
      </details>

      <div className={styles.docsLayout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarTitle}>
            <BookOpen size={15} aria-hidden="true" />
            <span>文档目录</span>
          </div>
          <nav aria-label="文档导航">
            {docEntries.map((entry) => (
              <Link
                className={entry.slug === currentSlug ? styles.currentNavItem : undefined}
                href={`/docs/${entry.slug}`}
                key={entry.slug}
              >
                <span>
                  <small>{entry.kicker}</small>
                  {entry.title}
                </span>
                <em>{entry.readTime}</em>
              </Link>
            ))}
          </nav>
          <div className={styles.sidebarNote}>
            <span className={styles.sidebarNoteDot} />
            <p>文档内容对应当前仓库实现，更新接口时请同步核对事实来源。</p>
          </div>
        </aside>

        <div className={styles.docsContent}>{children}</div>
      </div>
    </div>
  );
}
