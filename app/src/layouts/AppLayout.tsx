/*
 * 应用主布局(Codex 式):左侧会话栏 + 主区(顶栏 / 消息流 / 输入器)。
 * 会话状态见 features/chat/hooks/useChatSessions;本组件专注布局与动画编排。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Sidebar from "./Sidebar";
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
  // 平板断点(Token:1000px)以下默认收起侧栏,桌面端保持展开
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.innerWidth < 1000,
  );

  const spring = reduceMotion ? REDUCED_MOTION_TRANSITION : SPRING_LAYOUT;
  const contentSpring = reduceMotion
    ? REDUCED_MOTION_TRANSITION
    : SPRING_STANDARD;

  return (
    <div className={styles.layout}>
      <motion.aside
        className={styles.sidebar}
        initial={false}
        animate={{ width: sidebarCollapsed ? 0 : 320 }}
        transition={spring}
        aria-hidden={sidebarCollapsed}
      >
        <Sidebar
          sessions={sessions}
          activeId={activeSession?.id ?? null}
          onSelect={setActiveId}
          onNewSession={createSession}
        />
      </motion.aside>

      <main className={styles.main}>
        <ChatHeader
          session={activeSession}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
        />

        {/* AnimatePresence 保证会话切换时旧内容先退场,苹果式交叉过渡 */}
        <AnimatePresence mode="wait" initial={false}>
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
  );
}

export default AppLayout;
