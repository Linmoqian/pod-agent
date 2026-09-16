import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <section className={styles.page}>
      <div className={styles.card}>
        <Compass size={26} aria-hidden="true" />
        <span>404 / NOT IN THE WORKSPACE</span>
        <h1>这条路径还没有记录。</h1>
        <p>返回首页，或从文档目录选择一个已经登记的主题。</p>
        <Link href="/">
          <ArrowLeft size={15} aria-hidden="true" />
          返回首页
        </Link>
      </div>
    </section>
  );
}
