/*
 * 空状态欢迎页(Codex 式):品牌图标 + 居中输入器,保持极简。
 * 全屏影像仅允许出现在欢迎/空状态(Token 第 1 节),此处以留白与品牌图标建立情绪。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import { motion, useReducedMotion } from "motion/react";
import AppIcon from "../../../components/common/AppIcon";
import ChatComposer from "./ChatComposer";
import { REDUCED_MOTION_TRANSITION, SPRING_STANDARD } from "../../../utils/motion";
import styles from "./WelcomeState.module.css";

type WelcomeStateProps = {
  onSend: (text: string) => void;
};

function WelcomeState({ onSend }: WelcomeStateProps) {
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion ? REDUCED_MOTION_TRANSITION : SPRING_STANDARD;

  return (
    <div className={styles.welcome}>
      <motion.div
        className={styles.intro}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition}
      >
        <span className={styles.logo} aria-hidden>
          <AppIcon name="brand-sprout" size={34} />
        </span>
        <p className={styles.eyebrow}>POD AGENT</p>
        <h1 className={styles.title}>智慧育种，从一次对话开始</h1>
        <p className={styles.description}>
          比较品种性状、整理育种台账，并让田间数据成为清晰的下一步。
        </p>
      </motion.div>

      <ChatComposer onSend={onSend} autoFocus />
    </div>
  );
}

export default WelcomeState;
