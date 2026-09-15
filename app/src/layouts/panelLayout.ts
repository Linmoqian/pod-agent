/* 会话侧栏与育种台共享的停靠布局偏好。
 * Created on 2026-09-16
 * Updated on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

export type PanelId = 'navigation' | 'workbench';

export type PanelLayout = {
  reversed: boolean;
  navigation: number;
  workbench: number;
};

export const DEFAULT_PANEL_LAYOUT: PanelLayout = {
  reversed: false,
  navigation: 248,
  workbench: 320,
};

export const PANEL_MIN_WIDTH: Record<PanelId, number> = {
  navigation: 52,
  workbench: 280,
};

export const PANEL_MAX_WIDTH: Record<PanelId, number> = {
  navigation: 420,
  workbench: 480,
};

export const PANEL_LAYOUT_STORAGE_KEY = 'lian.chat-layout.v1';

export function readPanelLayout(): PanelLayout {
  try {
    const value = JSON.parse(
      localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY) || 'null',
    );
    if (
      value &&
      typeof value.reversed === 'boolean' &&
      Number.isFinite(value.navigation) &&
      Number.isFinite(value.workbench)
    ) {
      return {
        reversed: value.reversed,
        navigation: Math.min(
          PANEL_MAX_WIDTH.navigation,
          Math.max(PANEL_MIN_WIDTH.navigation, value.navigation),
        ),
        workbench: Math.min(
          PANEL_MAX_WIDTH.workbench,
          Math.max(PANEL_MIN_WIDTH.workbench, value.workbench),
        ),
      };
    }
  } catch {
    /* 布局偏好不可读时使用默认值。 */
  }
  return DEFAULT_PANEL_LAYOUT;
}

export function persistPanelLayout(next: PanelLayout) {
  try {
    localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 内存布局仍可使用。 */
  }
}
