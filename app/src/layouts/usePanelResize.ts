/*
 * 会话面板拖拽调宽 hook:宽度边界钳制 + localStorage 持久化。
 * 拖拽期间以 state 关闭过渡,避免宽度追赶鼠标的迟滞;松手时写回存储。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import { useCallback, useEffect, useRef, useState } from "react";

/* 图标栏 68px;面板宽度边界与 X-line route-panel 对齐 */
const RAIL_WIDTH = 68;
const PANEL_MIN_WIDTH = 280;
const PANEL_MAX_WIDTH = 720;
const PANEL_DEFAULT_WIDTH = 320;
const PANEL_WIDTH_STORAGE_KEY = "pod-agent.panel-width";

function loadPanelWidth(): number {
  try {
    const stored = window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY);
    if (stored) {
      const width = Number(stored);
      if (width >= PANEL_MIN_WIDTH && width <= PANEL_MAX_WIDTH) {
        return width;
      }
    }
  } catch {
    // localStorage 不可用时静默回退默认宽度
  }
  return PANEL_DEFAULT_WIDTH;
}

export default function usePanelResize() {
  const [panelWidth, setPanelWidth] = useState(loadPanelWidth);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);

  /* move/up 挂 document,保证鼠标移出把手后仍能持续追踪 */
  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = Math.min(
        PANEL_MAX_WIDTH,
        Math.max(PANEL_MIN_WIDTH, event.clientX - RAIL_WIDTH),
      );
      setPanelWidth(next);
    };
    const handleUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(panelWidth));
      } catch {
        // 持久化失败不影响当次使用
      }
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [panelWidth]);

  const handleResizeStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    draggingRef.current = true;
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  return { panelWidth, dragging, handleResizeStart };
}
