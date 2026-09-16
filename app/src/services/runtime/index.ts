/* 选择当前前端运行时，并保证 Tauri 与浏览器调试共享同一套 API。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import BrowserDebugRuntime from './browserDebugRuntime';
import BrowserPreviewRuntime from './browserPreviewRuntime';
import TauriRuntime from './tauriRuntime';
import type { FrontendRuntime, RuntimeMode } from './types';

export type { RuntimeMode } from './types';
export type {
  BrowserDebugControls,
  BrowserDebugEvent,
  BrowserDebugScenario,
  BrowserDebugState,
  FrontendRuntime,
  RuntimeAgentReplyDelta,
  RuntimeDropEvent,
  RuntimeEventMap,
  RuntimeEventName,
  RuntimeFile,
  RuntimeImageData,
  RuntimePickOptions,
  RuntimeSaveOptions,
  RuntimeUnlisten,
  RuntimeYoloDetection,
  RuntimeYoloEvent,
  RuntimeYoloModel,
  RuntimeYoloProgressItem,
  RuntimeYoloResponse,
} from './types';
export { default as BrowserDebugRuntime } from './browserDebugRuntime';

export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function getRuntimeMode(): RuntimeMode {
  if (isTauriRuntime()) return 'tauri';
  if (
    import.meta.env.DEV &&
    (new URLSearchParams(window.location.search).get('debug') === '1' ||
      import.meta.env.VITE_RUNTIME === 'browser-debug')
  ) {
    return 'browser-debug';
  }
  return 'browser-preview';
}

let runtime: FrontendRuntime | undefined;
let runtimeMode: RuntimeMode | undefined;

export function getFrontendRuntime(): FrontendRuntime {
  const mode = getRuntimeMode();
  if (runtime && runtimeMode === mode) return runtime;
  runtimeMode = mode;
  runtime = mode === 'tauri'
    ? new TauriRuntime()
    : mode === 'browser-debug'
      ? new BrowserDebugRuntime()
      : new BrowserPreviewRuntime();
  return runtime;
}

export function isBrowserDebugRuntime() {
  return getRuntimeMode() === 'browser-debug';
}

export function isBrowserPreviewRuntime() {
  return getRuntimeMode() === 'browser-preview';
}

/** 测试切换 window 运行时标记时使用，不暴露给产品 UI。 */
export function resetFrontendRuntimeForTests() {
  runtime = undefined;
  runtimeMode = undefined;
}
