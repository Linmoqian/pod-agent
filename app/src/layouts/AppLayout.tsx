/*
 * 应用主布局(参考 X-line AppShell):窄图标栏 + 毛玻璃会话面板(可拖宽/可折叠)
 * + 聊天主区 + 底部状态栏。面板宽度持久化到 localStorage,拖拽期间关闭过渡。
 * 会话状态见 features/chat/hooks/useChatSessions;本组件专注布局编排。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import AppIcon from "../components/common/AppIcon";
import IconRail from "./IconRail";
import Sidebar from "./Sidebar";
import StatusBar from "./StatusBar";
import usePanelResize from "./usePanelResize";
import ChatHeader from "../features/chat/components/ChatHeader";
import ChatComposer from "../features/chat/components/ChatComposer";
import MessageList from "../features/chat/components/MessageList";
import WelcomeState from "../features/chat/components/WelcomeState";
import useChatSessions from "../features/chat/hooks/useChatSessions";
import {
  REDUCED_MOTION_TRANSITION,
  SPRING_LAYOUT,
  SPRING_STANDARD,
} from "../utils/motion";
import styles from "./AppLayout.module.css";

function AppLayout() {
  const reduceMotion = useReducedMotion();
  const {
    sessions,
    activeSession,
    setActiveId,
    sendMessage,
    createSession,
  } = useChatSessions();

  const { panelWidth, dragging, handleResizeStart } = usePanelResize();
  const [panelCollapsed, setPanelCollapsed] = useState(
    // 平板断点(Token:1000px)以下默认收起面板,桌面端保持展开
    () => window.innerWidth < 1000,
  );

  const contentSpring = reduceMotion
    ? REDUCED_MOTION_TRANSITION
    : SPRING_STANDARD;
  const panelSpring = reduceMotion
    ? REDUCED_MOTION_TRANSITION
    : SPRING_LAYOUT;

  return (
    <div className={styles.layout}>
      <div className={styles.body}>
        {/* 图标栏 + 会话面板组成联合材料层,以毛玻璃和细边界贴主区左缘 */}
        <div
          className={styles.railShell}
          data-collapsed={panelCollapsed || undefined}
        >
          <IconRail />
          <motion.div
            className={styles.panel}
            initial={false}
            animate={{ width: panelCollapsed ? 0 : panelWidth }}
            transition={dragging ? { duration: 0 } : panelSpring}
            aria-hidden={panelCollapsed}
          >
            <Sidebar
              sessions={sessions}
              activeId={activeSession?.id ?? null}
              onSelect={setActiveId}
              onNewSession={createSession}
            />
          </motion.div>
          {/* 折叠开关吸附联合面板右缘,折叠后仍停在图标栏右侧 */}
          <button
            type="button"
            className={styles.collapseToggle}
            aria-label={panelCollapsed ? "展开面板" : "收起面板"}
            onClick={() => setPanelCollapsed((collapsed) => !collapsed)}
          >
            <AppIcon
              name="panel-arrow"
              size={15}
              transform={panelCollapsed ? "none" : "rotate-180"}
            />
          </button>
          <div
            className={styles.resizeHandle}
            role="separator"
            aria-orientation="vertical"
            aria-label="调整面板宽度"
            onMouseDown={handleResizeStart}
          />
        </div>

        <main className={styles.main}>
          <ChatHeader session={activeSession} />

          {/* 新旧会话同步进退,从当前画面连续交叉过渡 */}
          <AnimatePresence mode="sync" initial={false}>
            <motion.div
              key={activeSession?.id ?? "welcome"}
              className={styles.content}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={contentSpring}
            >
              {activeSession && activeSession.messages.length > 0 ? (
                <>
                  <MessageList session={activeSession} />
                  <ChatComposer onSend={sendMessage} />
                </>
              ) : (
                <WelcomeState onSend={sendMessage} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <StatusBar session={activeSession} sessionCount={sessions.length} />
    </div>
  );
}

export default AppLayout;
