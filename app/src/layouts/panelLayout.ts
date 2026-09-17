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

export const PANEL_MIN_WIDTH: Record<PanelId, number> = {
  navigation: 52,
  workbench: 280,
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
        navigation: Math.min(
          PANEL_MAX_WIDTH.navigation,
          Math.max(PANEL_MIN_WIDTH.navigation, value.navigation),
        ),
        workbench: Math.min(
          PANEL_MAX_WIDTH.workbench,
          Math.max(PANEL_MIN_WIDTH.workbench, value.workbench),
        ),
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
