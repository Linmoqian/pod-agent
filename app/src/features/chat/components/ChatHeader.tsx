/*
 * 主区顶栏:当前会话标题与状态、当前模型信息。
 * 样式依据设计 Token“组件配方 9.1”:白底、72px、shadow-header;
 * 面板折叠开关已移至会话面板右缘,顶栏不再承载侧栏开关。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import AppIcon from "../../../components/common/AppIcon";
import { useAppSelector } from "../../../store";
import { resolveModel } from "../../providers/services/registry";
import type { ChatSession } from "../types";
import styles from "./ChatHeader.module.css";

type ChatHeaderProps = {
  session: ChatSession | null;
};

function ChatHeader({ session }: ChatHeaderProps) {
  const currentModel = useAppSelector(
    (state) => state.providers.currentModel,
  );
  const modelName = currentModel
    ? (resolveModel(currentModel.providerId, currentModel.modelId)?.name ??
      currentModel.modelId)
    : null;

  return (
    <header className={styles.header}>
      <div className={styles.titleGroup}>
        <h2 className={styles.title}>{session ? session.title : "新任务"}</h2>
        {session && (
          <span className={styles.badge} data-status={session.status}>
            <span className={styles.badgeDot} aria-hidden />
            {session.status === "working" ? "进行中" : "已就绪"}
          </span>
        )}
      </div>

      {modelName && (
        <span className={styles.modelBadge}>
          <AppIcon name="model-chip" size={14} />
          {modelName}
        </span>
      )}
    </header>
  );
}

export default ChatHeader;
