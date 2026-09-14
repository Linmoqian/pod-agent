/* 验证真实响应驱动队列，不把失败图片归档。
 * Created on 2026-09-14
 * @author: https://github.com/Linmoqian
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useYoloTask } from './YoloTaskCard';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(async () => ['/a.png', '/b.png', '/c.png']) }));
vi.mock('../../../services/workspace', () => ({ isTauriRuntime: () => true }));

test('逐张推理，失败保留且重试后归档', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
  let failures = 0;
  const order: string[] = [];
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === 'yolo_models') return [{ id: 'test', name: 'test', available: true }];
    if (command === 'yolo_thumbnail') return [1, 2];
    const path = (args as { imagePath: string }).imagePath;
    order.push(path);
    if (path === '/b.png' && failures++ === 0) throw new Error('推理失败');
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
