/*
 * 空状态欢迎页(Codex 式):居中引导标题 + 建议任务 + 输入器。
 * 全屏影像仅允许出现在欢迎/空状态(Token 第 1 节),此处以留白与品牌图标建立情绪。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import { motion, useReducedMotion } from "motion/react";
import { Sprout } from "lucide-react";
import ChatComposer from "./ChatComposer";
import { SUGGESTIONS } from "../data/mockSessions";
import {
  REDUCED_MOTION_TRANSITION,
  SPRING_STANDARD,
} from "../../../utils/motion";
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
          <Sprout size={28} />
        </span>
        <h1 className={styles.heading}>今天想从哪块田开始?</h1>
        <p className={styles.subheading}>
          大豆育种智能体已就绪,选择一个方向,或直接描述你的任务。
        </p>
      </motion.div>

      <div className={styles.suggestions} role="list">
        {SUGGESTIONS.map((text, index) => (
          <motion.button
            key={text}
            type="button"
            role="listitem"
            className={styles.suggestionChip}
            onClick={() => onSend(text)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              ...transition,
              delay: reduceMotion ? 0 : 0.06 * (index + 1),
            }}
          >
            {text}
          </motion.button>
        ))}
      </div>

      <ChatComposer onSend={onSend} autoFocus />
    </div>
  );
}

export default WelcomeState;
