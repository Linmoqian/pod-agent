/*
 * 工作区启动时的加载占位。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import { motion, useReducedMotion } from 'motion/react';

import styles from './AppLayout.module.css';

export default function LoadingShell() {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={styles.loading}
      role="status"
      animate={reduced ? undefined : { opacity: [0.62, 1, 0.62] }}
      transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
    >
      <div className={styles.loadingHeader}><span /><i /><i /></div>
      <div className={styles.loadingMessages}><span /><span /><span /><span /></div>
      <div className={styles.loadingComposer}><span /><b /></div>
      <strong>正在连接 lian</strong>
    </motion.div>
  );
}
