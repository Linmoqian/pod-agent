/*
 * 会话面板拖拽调宽 hook:宽度边界钳制 + localStorage 持久化。
 * 拖拽期间以 state 关闭过渡,避免宽度追赶鼠标的迟滞;松手时写回存储。
 * Created on 2026-09-08
 * Updated on 2026-09-09
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
  const panelWidthRef = useRef(panelWidth);

  /* 指针捕获保证拖出热区后仍持续跟随；卸载时恢复全局指针状态。 */
  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  const handleResizeStart = useCallback((event: React.PointerEvent) => {
    if (!event.isPrimary || draggingRef.current) return;
    event.preventDefault();
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const handleResizeMove = useCallback((event: React.PointerEvent) => {
    if (!event.isPrimary || !draggingRef.current) return;
    const next = Math.min(
      PANEL_MAX_WIDTH,
      Math.max(PANEL_MIN_WIDTH, event.clientX - RAIL_WIDTH),
    );
    panelWidthRef.current = next;
    setPanelWidth(next);
  }, []);

  const handleResizeEnd = useCallback((event: React.PointerEvent) => {
    if (!event.isPrimary || !draggingRef.current) return;
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    try {
      window.localStorage.setItem(
        PANEL_WIDTH_STORAGE_KEY,
        String(panelWidthRef.current),
      );
    } catch {
      // 持久化失败不影响当次使用
    }
  }, []);

  const handleResizeKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.shiftKey ? 32 : 8;
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const next = Math.min(
      PANEL_MAX_WIDTH,
      Math.max(PANEL_MIN_WIDTH, panelWidthRef.current + direction * step),
    );
    panelWidthRef.current = next;
    setPanelWidth(next);
    try {
      window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(next));
    } catch {
      // 持久化失败不影响当次使用
    }
  }, []);

  return {
    panelWidth,
    panelMinWidth: PANEL_MIN_WIDTH,
    panelMaxWidth: PANEL_MAX_WIDTH,
    dragging,
    handleResizeStart,
    handleResizeMove,
    handleResizeEnd,
    handleResizeKeyDown,
  };
}
