/*
 * 空状态欢迎页(Codex 式):品牌图标 + 居中输入器,保持极简。
 * 全屏影像仅允许出现在欢迎/空状态(Token 第 1 节),此处以留白与品牌图标建立情绪。
 * Created on 2026-09-08
 * Updated on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import AppIcon from "../../../components/common/AppIcon";
import ChatComposer from "./ChatComposer";
import styles from "./WelcomeState.module.css";

type WelcomeStateProps = {
  onSend: (text: string) => void;
};

function WelcomeState({ onSend }: WelcomeStateProps) {
  return (
    <div className={styles.welcome}>
      <div className={styles.intro}>
        <span className={styles.logo} aria-hidden>
          <AppIcon name="brand-sprout" size={34} />
        </span>
        <p className={styles.eyebrow}>POD AGENT</p>
        <h1 className={styles.title}>智慧育种，从一次对话开始</h1>
        <p className={styles.description}>
          比较品种性状、整理育种台账，并让田间数据成为清晰的下一步。
        </p>
      </div>

      <ChatComposer onSend={onSend} autoFocus />
    </div>
  );
}

export default WelcomeState;
