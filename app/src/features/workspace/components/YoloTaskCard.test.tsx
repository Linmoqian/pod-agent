/* 验证真实响应驱动队列，不把失败图片归档。
 * Created on 2026-09-15
 * @author: https://github.com/Linmoqian
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { useYoloTask } from './YoloTaskCard';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => vi.fn()) }));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ onDragDropEvent: vi.fn(async () => vi.fn()) }) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async () => ['/a.png', '/b.png', '/c.png']),
}));
vi.mock('../../../services/workspace', () => ({ isTauriRuntime: () => true }));

test('批量推理，失败保留且重试后归档', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
  let failures = 0;
  const order: string[] = [];
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === 'yolo_models') return [{ id: 'test', name: 'test', available: true }];
    if (command === 'yolo_memory_gb') return 4;
    if (command === 'yolo_thumbnail') return [1, 2];
    if (command === 'yolo_detect_images') {
      const paths = (args as { imagePaths: string[] }).imagePaths;
      order.push(...paths);
      return paths.map((path) => path === '/b.png' && failures++ === 0
        ? { ok: false, message: '推理失败' }
        : { ok: true, message: '检测到 1 个对象' });
    }
    return { ok: true, message: '检测到 1 个对象' };
  });
  const { result } = renderHook(useYoloTask);
  await waitFor(() => expect(result.current.modelId).toBe('test'));
  await act(async () => result.current.add());
  await waitFor(() => expect(result.current.photos.map((p) => p.status)).toEqual(['done', 'error', 'done']));
  expect(order).toEqual(['/a.png', '/b.png', '/c.png']);
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.photos.every((p) => p.status === 'done')).toBe(true));
});

test('文件夹扫描后保留坏图失败状态并推理其他图片', async () => {
  vi.mocked(open).mockResolvedValueOnce('/photos');
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === 'yolo_models') return [{ id: 'test', name: 'test', available: true }];
    if (command === 'yolo_memory_gb') return 4;
    if (command === 'yolo_folder_images') return ['/photos/bad.png', '/photos/sub/good.JPG'];
    if (command === 'yolo_thumbnail') {
      return [1];
    }
    if (command === 'yolo_detect_images') {
      return (args as { imagePaths: string[] }).imagePaths.map((path) => path.includes('bad')
        ? { ok: false, message: '坏图' }
        : { ok: true, message: '检测到 0 个对象' });
    }
    return { ok: true, message: '检测到 0 个对象' };
  });
  const { result } = renderHook(useYoloTask);
  await waitFor(() => expect(result.current.modelId).toBe('test'));
  const addPromise = result.current.add(true);
  await waitFor(() => expect(result.current.addConfirmation).toBe(2));
  act(() => result.current.resolveAddConfirmation(true));
  await act(async () => addPromise);
  await waitFor(() => expect(result.current.photos.map((photo) => photo.status)).toEqual(['error', 'done']));
  expect(result.current.photos).toHaveLength(2);
  expect(result.current.photos[0].message).toBe('坏图');
  expect(open).toHaveBeenLastCalledWith({ directory: true, multiple: false });
  expect(result.current.addConfirmation).toBeNull();
});

test('Finder 混合路径通过原生扫描进入推理队列', async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'yolo_models') return [{ id: 'test', name: 'test', available: true }];
    if (command === 'yolo_memory_gb') return 4;
    if (command === 'yolo_drop_images') return ['/folder/a.png', '/b.JPG'];
    if (command === 'yolo_thumbnail') return [1];
    if (command === 'yolo_detect_images') {
      return (args as { imagePaths: string[] }).imagePaths.map(() => ({ ok: true, message: '检测到 0 个对象' }));
    }
    return { ok: true, message: '检测到 0 个对象' };
  });
  const { result } = renderHook(useYoloTask);
  await waitFor(() => expect(result.current.modelId).toBe('test'));
  await act(async () => result.current.add(false, ['/folder', '/b.JPG']));
  await waitFor(() => expect(result.current.photos.map((p) => p.status)).toEqual(['done', 'done']));
  expect(invoke).toHaveBeenCalledWith('yolo_drop_images', { paths: ['/folder', '/b.JPG'] });
});

test('工具事件只渲染卡片，不重复推理，失败不可由本地重试', async () => {
  vi.mocked(invoke).mockClear();
  vi.mocked(invoke).mockImplementation(async (command) => command === 'yolo_models' ? [] : [1]);
  const { result } = renderHook(useYoloTask);
  await waitFor(() => expect(listen).toHaveBeenCalled());
  const calls = vi.mocked(listen).mock.calls;
  const receive = calls[calls.length - 1][1];
  await act(async () => {
    receive({ payload: { id: 'tool-1', status: 'running', imagePath: '/a.png', modelId: 'python-model' } } as never);
    receive({ payload: { id: 'tool-1', status: 'done', message: '检测到 2 个对象' } } as never);
  });
  expect(result.current.photos[0]).toMatchObject({ external: true, status: 'done', message: '检测到 2 个对象' });
  await act(async () => receive({ payload: { id: 'tool-1', status: 'error' } } as never));
  act(() => result.current.retry());
  expect(result.current.photos[0].status).toBe('error');
  expect(vi.mocked(invoke).mock.calls.some(([command]) => command === 'yolo_detect_image' || command === 'yolo_detect_images')).toBe(false);
});
