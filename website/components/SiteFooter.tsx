import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Code2 } from "lucide-react";

import styles from "./SiteFooter.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.identity}>
          <Image
            src="/brand/lian-lab-wordmark-transparent.png"
            alt="lian@lab"
            width={120}
            height={40}
          />
          <p>把实验问题，变成可以继续推进的下一步。</p>
        </div>
        <div className={styles.links}>
          <Link href="/">首页</Link>
          <Link href="/docs">文档</Link>
          <Link href="/docs/development">参与开发</Link>
          <a
            href="https://github.com/LianLab-SCAU/LianAgent"
            target="_blank"
            rel="noreferrer"
          >
            <Code2 size={15} aria-hidden="true" />
            GitHub
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </div>
        <p className={styles.note}>Pod Agent · 本地优先的育种科研工作空间</p>
      </div>
    </footer>
  );
}
