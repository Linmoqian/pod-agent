import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";

import styles from "./SiteHeader.module.css";

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/" aria-label="Pod Agent 首页">
          <Image
            src="/brand/lian-lab-wordmark-transparent.png"
            alt="lian@lab"
            width={132}
            height={44}
            priority
          />
          <span className={styles.productName}>Pod Agent</span>
        </Link>

        <nav className={styles.nav} aria-label="主导航">
          <Link href="/#capabilities">产品能力</Link>
          <Link href="/docs">
            <BookOpen size={15} aria-hidden="true" />
            开发文档
          </Link>
          <a
            href="https://github.com/LianLab-SCAU/LianAgent"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </nav>

        <Link className={styles.docsButton} href="/docs/quickstart">
          开始阅读
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
