/*
 * 应用主布局(参考 X-line AppShell):窄图标栏 + 毛玻璃会话面板(可拖宽/可折叠)
 * + 聊天主区 + 底部状态栏。面板宽度持久化到 localStorage,拖拽期间关闭过渡。
 * 会话状态见 features/chat/hooks/useChatSessions;本组件专注布局编排。
 * Created on 2026-09-08
 * Updated on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
  SESSION_ENTER_TRANSITION,
  SESSION_EXIT_TRANSITION,
  SPRING_LAYOUT,
} from "../utils/motion";
import styles from "./AppLayout.module.css";

function AppLayout() {
  const reduceMotion = useReducedMotion();
  const { sessions, activeSession, setActiveId, sendMessage, createSession } =
    useChatSessions();
  const {
    panelWidth,
    panelMinWidth,
    panelMaxWidth,
    dragging,
    handleResizeStart,
    handleResizeMove,
    handleResizeEnd,
    handleResizeKeyDown,
  } = usePanelResize();
  const [panelCollapsed, setPanelCollapsed] = useState(
    () => window.innerWidth < 1000,
  );
  const contentEnterTransition = reduceMotion
    ? REDUCED_MOTION_TRANSITION
    : SESSION_ENTER_TRANSITION;
  const contentExitTransition = reduceMotion
    ? REDUCED_MOTION_TRANSITION
    : SESSION_EXIT_TRANSITION;
  const panelSpring = reduceMotion ? REDUCED_MOTION_TRANSITION : SPRING_LAYOUT;

  return (
    <div className={styles.layout}>
      <div className={styles.body}>
        {/* 图标栏 + 会话面板组成联合材料层,以毛玻璃和细边界贴主区左缘 */}
        <div
          className={styles.railShell}
          data-collapsed={panelCollapsed || undefined}
        >
          <IconRail
            panelCollapsed={panelCollapsed}
            onTogglePanel={() => setPanelCollapsed((collapsed) => !collapsed)}
          />
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
          <div
            className={styles.resizeHandle}
            role="separator"
            aria-orientation="vertical"
            aria-label="调整面板宽度"
            aria-valuemin={panelMinWidth}
            aria-valuemax={panelMaxWidth}
            aria-valuenow={Math.round(panelWidth)}
            tabIndex={0}
            onPointerDown={handleResizeStart}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
            onKeyDown={handleResizeKeyDown}
          />
        </div>

        <main className={styles.main}>
          <ChatHeader session={activeSession} />

          <AnimatePresence mode="sync" initial={false}>
            <motion.div
              key={activeSession?.id ?? "welcome"}
              className={styles.content}
              initial={{ opacity: 0, transform: "translateX(-8px)" }}
              animate={{
                opacity: 1,
                transform: "translateX(0)",
                transition: contentEnterTransition,
              }}
              exit={{
                opacity: 0,
                transform: "translateX(6px)",
                transition: contentExitTransition,
              }}
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
