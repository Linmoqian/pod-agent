/* 前端运行时适配层的共享类型。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import type {
  LifecycleEvent,
  WorkspaceFileNode,
  WorkspaceFilePreview,
} from '../../features/workspace/types';

export type RuntimeMode = 'tauri' | 'browser-preview' | 'browser-debug';

export type RuntimeFile = {
  path: string;
  name: string;
  size: number;
  type: string;
  file?: File;
};

export type RuntimeImageData = {
  bytes: number[];
  mimeType: string;
};

export type RuntimeYoloDetection = {
  className: string;
  score: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RuntimeYoloResponse = {
  ok: boolean;
  message: string;
  count?: number;
  counts?: Record<string, number>;
  detections?: RuntimeYoloDetection[];
};

export type RuntimeYoloModel = {
  id: string;
  name: string;
  available: boolean;
};

export type RuntimeYoloProgressItem = {
  imagePath: string;
  index: number;
  total: number;
  result: RuntimeYoloResponse;
};

export type RuntimeYoloEvent = {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  conversationId?: string;
  imagePath?: string;
  modelId?: string;
  message?: string;
  count?: number;
  counts?: Record<string, number>;
  detections?: RuntimeYoloDetection[];
};

export type RuntimeAgentReplyDelta = {
  eventType: 'agent.reply.delta';
  requestId: string;
  conversationId: string;
  kind: 'thinking' | 'text';
  delta: string;
};

export type BrowserDebugEvent = {
  type: 'reset' | 'scenario.loaded' | 'snapshot.changed' | 'log';
  message?: string;
  scenario?: BrowserDebugScenario;
  timestamp: string;
};

export type RuntimeEventMap = {
  'lian-import-event': LifecycleEvent;
  'lian-agent-event': LifecycleEvent | RuntimeAgentReplyDelta;
  'lian-workflow-event': LifecycleEvent;
  'lian-yolo-event': RuntimeYoloEvent;
  'lian-debug-event': BrowserDebugEvent;
};

export type RuntimeEventName = keyof RuntimeEventMap;
export type RuntimeUnlisten = () => void;

export type RuntimeDropEvent = {
  type: 'enter' | 'over' | 'drop' | 'leave';
  files: RuntimeFile[];
  position?: { x: number; y: number };
};

export type RuntimePickOptions = {
  directory?: boolean;
  multiple?: boolean;
  accept?: string[];
};

export type BrowserDebugScenario =
  | 'blank'
  | 'workspace'
  | 'agent'
  | 'yolo'
  | 'full';

export type BrowserDebugState = {
  paused: boolean;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  eventLog: string[];
};

export type BrowserDebugControls = {
  loadScenario: (scenario: BrowserDebugScenario) => void;
  reset: () => void;
  setInferencePaused: (paused: boolean) => void;
  stepInference: (count: 1 | 8) => void;
  failNextInference: () => void;
  retryFailedInference: () => void;
  clearLog: () => void;
  getState: () => BrowserDebugState;
  subscribe: (listener: () => void) => RuntimeUnlisten;
};

export type RuntimeSaveOptions = {
  defaultPath: string;
  extension: string;
};

export interface FrontendRuntime {
  readonly mode: RuntimeMode;
  readonly debug?: BrowserDebugControls;
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  listen<K extends RuntimeEventName>(
    eventName: K,
    callback: (payload: RuntimeEventMap[K]) => void,
  ): Promise<RuntimeUnlisten>;
  pickFiles(options: RuntimePickOptions): Promise<RuntimeFile[]>;
  subscribeDrop(
    callback: (event: RuntimeDropEvent) => void,
  ): Promise<RuntimeUnlisten>;
  saveFile(options: RuntimeSaveOptions): Promise<string | null>;
  getNativeAssetUrl(path: string): string | undefined;
  readThumbnail(path: string): Promise<RuntimeImageData>;
  readImagePreview(path: string): Promise<RuntimeImageData>;
  readResultPreview(
    path: string,
    detections: RuntimeYoloDetection[],
  ): Promise<RuntimeImageData>;
  detectImages(
    modelId: string,
    imagePaths: string[],
    onItem: (item: RuntimeYoloProgressItem) => void,
  ): Promise<void>;
}

export type BrowserDebugFileTree = {
  tree: WorkspaceFileNode;
  readFile: (relativePath: string) => WorkspaceFilePreview;
};
