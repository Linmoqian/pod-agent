import Image from "next/image";
import {
  BarChart3,
  Check,
  Database,
  FileSpreadsheet,
  FolderKanban,
  MessageSquare,
  MoreHorizontal,
  ScanLine,
  Sparkles,
  Workflow
} from "lucide-react";

import styles from "./ProductPreview.module.css";

export function ProductPreview() {
  return (
    <div className={styles.window} aria-label="Pod Agent 桌面工作区预览">
      <div className={styles.windowBar}>
        <div className={styles.traffic} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className={styles.windowTitle}>lian@育种台</span>
        <span className={styles.windowStatus}>
          <span className={styles.statusDot} /> 本地工作区
        </span>
      </div>

      <div className={styles.workspace}>
        <aside className={styles.rail} aria-label="工作区导航示意">
          <div className={`${styles.railLogo} ${styles.activeRail}`}>
            <Sparkles size={17} aria-hidden="true" />
          </div>
          <div className={styles.railIcon}>
            <MessageSquare size={17} aria-hidden="true" />
          </div>
          <div className={styles.railIcon}>
            <FolderKanban size={17} aria-hidden="true" />
          </div>
          <div className={styles.railIcon}>
            <BarChart3 size={17} aria-hidden="true" />
          </div>
          <div className={styles.railBottom}>
            <MoreHorizontal size={17} aria-hidden="true" />
          </div>
        </aside>

        <aside className={styles.projectPanel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.panelKicker}>Project</span>
              <strong>春季大豆试验</strong>
            </div>
            <MoreHorizontal size={16} aria-hidden="true" />
          </div>
          <div className={styles.panelRule} />
          <span className={styles.panelLabel}>研究上下文</span>
          <div className={styles.contextItem}>
            <Database size={14} aria-hidden="true" />
            <span>3 个数据集</span>
            <b>3</b>
          </div>
          <div className={styles.contextItem}>
            <Workflow size={14} aria-hidden="true" />
            <span>2 个进行中任务</span>
            <b>2</b>
          </div>
          <div className={styles.panelNote}>
            <span>最近更新</span>
            <strong>今天 10:24</strong>
          </div>
        </aside>

        <section className={styles.chatPanel} aria-label="研究对话示意">
          <div className={styles.chatHeader}>
            <div>
              <span className={styles.panelKicker}>Conversation</span>
              <strong>性状表现初步比较</strong>
            </div>
            <span className={styles.livePill}>
              <span className={styles.statusDot} />
              已连接
            </span>
          </div>

          <div className={styles.messages}>
            <div className={styles.userMessage}>
              比较这批材料的株高与百粒重，先帮我整理分析思路。
            </div>
            <div className={styles.agentRow}>
              <div className={styles.avatar}>
                <Image
                  src="/brand/agent-mascot.png"
                  alt=""
                  width={44}
                  height={44}
                />
              </div>
              <div className={styles.agentMessage}>
                <p>我会先确认数据字段和质量，再生成一份可确认的分析计划。</p>
                <div className={styles.planMini}>
                  <div className={styles.planMiniTitle}>
                    <Workflow size={14} aria-hidden="true" />
                    <strong>TaskPlan · 待确认</strong>
                    <span>3 步</span>
                  </div>
                  <div className={styles.planRow}>
                    <Check size={13} aria-hidden="true" />
                    检查字段与缺失值
                  </div>
                  <div className={styles.planRow}>
                    <span className={styles.planNumber}>2</span>
                    比较性状分布
                  </div>
                  <div className={styles.planRowMuted}>
                    <span className={styles.planNumber}>3</span>
                    生成可追溯 Artifact
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.composer}>
            <span>继续描述你的研究问题…</span>
            <span className={styles.composerHint}>Enter 发送</span>
          </div>
        </section>
      </div>

      <div className={styles.windowCaption}>
        <span>
          <FileSpreadsheet size={14} aria-hidden="true" />
          数据、计划与结果在同一条研究链路里
        </span>
        <span>
          <ScanLine size={14} aria-hidden="true" />
          本地优先
        </span>
      </div>
    </div>
  );
}
