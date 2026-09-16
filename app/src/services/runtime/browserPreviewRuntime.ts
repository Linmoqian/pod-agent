/* 只读浏览器预览运行时：保留没有 Tauri 时的安全降级行为。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import { createBrowserPreviewFileTree } from './browserPreviewFixtures';
import type { TerminalRunResult } from '../../features/workspace/types';
import type {
  FrontendRuntime,
  RuntimeDropEvent,
  RuntimeEventMap,
  RuntimeEventName,
  RuntimeImageData,
  RuntimePickOptions,
  RuntimeSaveOptions,
  RuntimeUnlisten,
  RuntimeYoloDetection,
  RuntimeYoloProgressItem,
} from './types';

const PREVIEW_TERMINAL_RESULT: TerminalRunResult = {
  stdout: '',
  stderr: '浏览器预览不支持执行本机命令，请在 Tauri 桌面端使用。',
  status: null,
  success: false,
  truncated: false,
  durationMs: 0,
  cwd: '当前工程根目录',
};

export default class BrowserPreviewRuntime implements FrontendRuntime {
  readonly mode = 'browser-preview' as const;

  async invoke<T>(command: string) {
    if (command === 'list_workspace_files') return createBrowserPreviewFileTree() as T;
    if (command === 'read_workspace_file') {
      throw new Error('浏览器预览需要通过 readWorkspaceFile 读取文件');
    }
    if (command === 'set_terminal_access') return undefined as T;
    if (command === 'run_terminal_command') return PREVIEW_TERMINAL_RESULT as T;
    if (command === 'yolo_models') return [] as T;
    throw new Error(`浏览器预览不支持调用：${command}`);
  }

  async listen<K extends RuntimeEventName>(
    _eventName: K,
    _callback: (payload: RuntimeEventMap[K]) => void,
  ): Promise<RuntimeUnlisten> {
    void _eventName;
    void _callback;
    return () => undefined;
  }

  async pickFiles(_options: RuntimePickOptions) {
    void _options;
    return [];
  }

  async subscribeDrop(_callback: (event: RuntimeDropEvent) => void) {
    void _callback;
    return () => undefined;
  }

  async saveFile(_options: RuntimeSaveOptions) {
    void _options;
    return null;
  }

  getNativeAssetUrl(_path: string) {
    void _path;
    return undefined;
  }

  async readThumbnail(_path: string): Promise<RuntimeImageData> {
    void _path;
    throw new Error('浏览器预览不读取本机图片，请在 Tauri 桌面端查看原图');
  }

  async readImagePreview(_path: string): Promise<RuntimeImageData> {
    void _path;
    throw new Error('浏览器预览不读取本机图片，请在 Tauri 桌面端查看原图');
  }

  async readResultPreview(
    _path: string,
    _detections: RuntimeYoloDetection[],
  ): Promise<RuntimeImageData> {
    void _path;
    void _detections;
    throw new Error('浏览器预览不读取本机图片，请在 Tauri 桌面端查看结果图');
  }

  async detectImages(
    _modelId: string,
    _imagePaths: string[],
    _onItem: (item: RuntimeYoloProgressItem) => void,
  ) {
    void _modelId;
    void _imagePaths;
    void _onItem;
    throw new Error('浏览器预览不执行图片推理，请在 Tauri 桌面端运行');
  }
}
