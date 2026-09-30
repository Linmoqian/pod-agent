/* 会话侧栏与育种台共享的停靠布局偏好。
 * Created on 2026-09-16
 * Updated on 2026-09-17
 * @author: https://github.com/Linmoqian
 */

export type PanelId = 'navigation' | 'workbench';

export const WORKBENCH_MODULE_IDS = [
  'imageRecognition',
  'resourceMonitor',
  'taskPanel',
] as const;

export type WorkbenchModuleId = (typeof WORKBENCH_MODULE_IDS)[number];
export type WorkbenchModuleDensity = 'simple' | 'complex';

export type PanelLayout = {
  reversed: boolean;
  navigation: number;
  workbench: number;
  showImageRecognition: boolean;
  showFileTree: boolean;
  showResourceMonitor: boolean;
  workbenchOrder: WorkbenchModuleId[];
  imageRecognitionDensity: WorkbenchModuleDensity;
  resourceMonitorDensity: WorkbenchModuleDensity;
};

export const DEFAULT_PANEL_LAYOUT: PanelLayout = {
  reversed: false,
  navigation: 248,
  workbench: 320,
  showImageRecognition: true,
  showFileTree: true,
  showResourceMonitor: true,
  workbenchOrder: [...WORKBENCH_MODULE_IDS],
  imageRecognitionDensity: 'complex',
  resourceMonitorDensity: 'complex',
};

/* 两条侧栏压到该宽度时改用图标 rail 呈现：宽度与图标规格完全一致，避免左右不对称。 */
export const PANEL_COMPACT_WIDTH = 64;

/* 拖到该宽度以下即吸附为 rail，避免出现把完整卡片挤成一条的中间态。 */
export const PANEL_COMPACT_SNAP_THRESHOLD = 160;

export const PANEL_MIN_WIDTH: Record<PanelId, number> = {
  navigation: PANEL_COMPACT_WIDTH,
  workbench: PANEL_COMPACT_WIDTH,
};

export const PANEL_MAX_WIDTH: Record<PanelId, number> = {
  navigation: 420,
  workbench: 480,
};

export const PANEL_LAYOUT_STORAGE_KEY = 'lian.chat-layout.v1';

function isWorkbenchModuleId(value: unknown): value is WorkbenchModuleId {
  return typeof value === 'string' && WORKBENCH_MODULE_IDS.includes(value as WorkbenchModuleId);
}

function readWorkbenchOrder(value: unknown) {
  const order = Array.isArray(value) ? value.filter(isWorkbenchModuleId) : [];
  const unique = order.filter((moduleId, index) => order.indexOf(moduleId) === index);
  return [
    ...unique,
    ...WORKBENCH_MODULE_IDS.filter((moduleId) => !unique.includes(moduleId)),
  ];
}

/* 收窄到吸附阈值以内时统一收成 rail 宽度。 */
function readWidth(value: number, panel: PanelId) {
  const width = Math.min(
    PANEL_MAX_WIDTH[panel],
    Math.max(PANEL_MIN_WIDTH[panel], value),
  );
  return width <= PANEL_COMPACT_SNAP_THRESHOLD ? PANEL_COMPACT_WIDTH : width;
}

function readDensity(
  value: unknown,
  fallback: WorkbenchModuleDensity,
): WorkbenchModuleDensity {
  return value === 'simple' || value === 'complex' ? value : fallback;
}

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
        navigation: readWidth(value.navigation, 'navigation'),
        workbench: readWidth(value.workbench, 'workbench'),
        showImageRecognition:
          typeof value.showImageRecognition === 'boolean'
            ? value.showImageRecognition
            : DEFAULT_PANEL_LAYOUT.showImageRecognition,
        showFileTree:
          typeof value.showFileTree === 'boolean'
            ? value.showFileTree
            : DEFAULT_PANEL_LAYOUT.showFileTree,
        showResourceMonitor:
          typeof value.showResourceMonitor === 'boolean'
            ? value.showResourceMonitor
            : DEFAULT_PANEL_LAYOUT.showResourceMonitor,
        workbenchOrder: readWorkbenchOrder(value.workbenchOrder),
        imageRecognitionDensity: readDensity(
          value.imageRecognitionDensity,
          DEFAULT_PANEL_LAYOUT.imageRecognitionDensity,
        ),
        resourceMonitorDensity: readDensity(
          value.resourceMonitorDensity,
          DEFAULT_PANEL_LAYOUT.resourceMonitorDensity,
        ),
      };
    }
  } catch {
    /* 布局偏好不可读时使用默认值。 */
  }
  return {
    ...DEFAULT_PANEL_LAYOUT,
    workbenchOrder: [...DEFAULT_PANEL_LAYOUT.workbenchOrder],
  };
}

export function persistPanelLayout(next: PanelLayout) {
  try {
    localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 内存布局仍可使用。 */
  }
}
