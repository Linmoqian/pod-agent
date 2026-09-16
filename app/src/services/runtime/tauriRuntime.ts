/* Tauri 运行时适配：把原生 IPC、文件选择与窗口事件封装给前端。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open, save } from '@tauri-apps/plugin-dialog';

import type {
  FrontendRuntime,
  RuntimeDropEvent,
  RuntimeEventMap,
  RuntimeEventName,
  RuntimeFile,
  RuntimeImageData,
  RuntimePickOptions,
  RuntimeSaveOptions,
  RuntimeUnlisten,
  RuntimeYoloDetection,
  RuntimeYoloProgressItem,
  RuntimeYoloResponse,
} from './types';

function fileName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function nativeFile(path: string): RuntimeFile {
  return {
    path,
    name: fileName(path),
    size: 0,
    type: '',
  };
}

function toImageData(bytes: number[]): RuntimeImageData {
  return { bytes, mimeType: 'image/png' };
}

export default class TauriRuntime implements FrontendRuntime {
  readonly mode = 'tauri' as const;

  invoke<T>(command: string, args?: Record<string, unknown>) {
    return invoke<T>(command, args);
  }

  async listen<K extends RuntimeEventName>(
    eventName: K,
    callback: (payload: RuntimeEventMap[K]) => void,
  ): Promise<RuntimeUnlisten> {
    return listen<RuntimeEventMap[K]>(eventName, (event) => {
      callback(event.payload);
    });
  }

  async pickFiles(options: RuntimePickOptions) {
    const dialogOptions: {
      directory?: boolean;
      multiple?: boolean;
      filters?: Array<{ name: string; extensions: string[] }>;
    } = {
      directory: options.directory,
      multiple: options.directory ? false : options.multiple ?? true,
    };
    if (options.accept?.length) {
      dialogOptions.filters = [{ name: '支持文件', extensions: options.accept }];
    }
    const selected = await open(dialogOptions);
    if (!selected) return [];
    const paths = Array.isArray(selected) ? selected : [selected];
    return paths.map(nativeFile);
  }

  subscribeDrop(callback: (event: RuntimeDropEvent) => void) {
    return getCurrentWebview().onDragDropEvent((event) => {
      callback({
        type: event.payload.type,
        files: event.payload.type === 'enter' || event.payload.type === 'drop'
          ? event.payload.paths.map(nativeFile)
          : [],
        position: event.payload.type === 'leave' ? undefined : event.payload.position,
      });
    });
  }

  saveFile(options: RuntimeSaveOptions) {
    return save({
      defaultPath: options.defaultPath,
      filters: [{ name: options.extension.toUpperCase(), extensions: [options.extension] }],
    });
  }

  getNativeAssetUrl(path: string) {
    return convertFileSrc(path, 'asset');
  }

  async readThumbnail(path: string) {
    return toImageData(await invoke<number[]>('yolo_thumbnail', { imagePath: path }));
  }

  async readImagePreview(path: string) {
    return toImageData(await invoke<number[]>('yolo_image_preview', { imagePath: path }));
  }

  async readResultPreview(path: string, detections: RuntimeYoloDetection[]) {
    return toImageData(
      await invoke<number[]>('yolo_result_preview', {
        imagePath: path,
        detections,
      }),
    );
  }

  async detectImages(
    modelId: string,
    imagePaths: string[],
    onItem: (item: RuntimeYoloProgressItem) => void,
  ) {
    const results = await invoke<RuntimeYoloResponse[]>('yolo_detect_images', {
      modelId,
      imagePaths,
    });
    if (!Array.isArray(results)) throw new Error('批量推理响应无效');
    imagePaths.forEach((imagePath, index) => {
      onItem({
        imagePath,
        index,
        total: imagePaths.length,
        result: results[index] ?? {
          ok: false,
          message: '批量推理未返回该图片结果',
        },
      });
    });
  }
}
