/* 验证浏览器调试运行时的模式、安全边界与逐图片推理控制。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  RuntimeAgentReplyDelta,
  RuntimeDropEvent,
  RuntimeYoloProgressItem,
} from './types';
import type {
  WorkflowRun,
  WorkspaceFileNode,
  WorkspaceSnapshot,
} from '../../features/workspace/types';
import BrowserDebugRuntime from './browserDebugRuntime';
import {
  getFrontendRuntime,
  getRuntimeMode,
  resetFrontendRuntimeForTests,
} from './index';

describe('BrowserDebugRuntime', () => {
  afterEach(() => {
    vi.useRealTimers();
    resetFrontendRuntimeForTests();
    if (!('__TAURI_INTERNALS__' in window)) {
      Object.defineProperty(window, '__TAURI_INTERNALS__', {
        configurable: true,
        value: {},
      });
    }
    window.history.replaceState({}, '', '/');
  });

  it('按 Tauri、显式调试、普通预览的优先级选择运行时', () => {
    resetFrontendRuntimeForTests();
    window.history.replaceState({}, '', '/?debug=1');
    expect(getRuntimeMode()).toBe('tauri');

    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    expect(getRuntimeMode()).toBe('browser-debug');

    window.history.replaceState({}, '', '/');
    expect(getRuntimeMode()).toBe('browser-preview');
  });

  it('提供内存快照、文件预览和安全的模拟终端', async () => {
    const runtime = new BrowserDebugRuntime();
    const tree = await runtime.invoke<{ name: string }>('list_workspace_files');
    const file = await runtime.invoke<{ kind: string; content: string }>(
      'read_workspace_file',
      { relativePath: 'app/README.md' },
    );
    const pwd = await runtime.invoke<{ stdout: string; success: boolean }>(
      'run_terminal_command',
      { request: { command: 'pwd' } },
    );
    const unknown = await runtime.invoke<{ stderr: string; success: boolean }>(
      'run_terminal_command',
      { request: { command: 'rm -rf /' } },
    );

    expect(tree.name).toBe('pod-agent');
    expect(file.kind).toBe('markdown');
    expect(file.content).toContain('浏览器预览');
    expect(pwd).toMatchObject({ stdout: '/workspace/pod-agent\n', success: true });
    expect(unknown).toMatchObject({ success: false });
    expect(unknown.stderr).toContain('不执行命令');
  });

  it('Agent 图片请求产生增量回复并创建 YOLO 任务', async () => {
    vi.useFakeTimers();
    const runtime = new BrowserDebugRuntime();
    const replies: Array<{ kind: string; delta: string }> = [];
    const yoloEvents: Array<{ status: string; imagePath?: string }> = [];
    await runtime.listen('lian-agent-event', (event) => {
      if ('kind' in event) replies.push(event);
    });
    await runtime.listen('lian-yolo-event', (event) => yoloEvents.push(event));

    const reply = runtime.invoke('send_message', {
      conversationId: 'browser-debug',
      content: '我有一批图片，位置在 /tmp/photos',
      requestId: 'debug-request-1',
    });
    await vi.advanceTimersByTimeAsync(140);
    await reply;

    expect(replies.map((event) => event.kind)).toEqual(['thinking', 'text']);
    expect(yoloEvents.filter((event) => event.status === 'queued')).toHaveLength(8);
    expect(yoloEvents.some((event) => event.status === 'running')).toBe(true);
    expect(runtime.debug.getState()).toMatchObject({ queued: 7, running: 1 });
  });

  it('Batch=8 支持暂停、单步、失败注入和重置失效代次', async () => {
    vi.useFakeTimers();
    const runtime = new BrowserDebugRuntime();
    const paths = Array.from({ length: 2 }, (_, index) => `browser-debug://test/${index}.png`);
    const results: Array<{ ok: boolean }> = [];

    runtime.debug.setInferencePaused(true);
    const request = runtime.detectImages('yolov8n-coco', paths, (item) => {
      results.push(item.result);
    });
    await vi.advanceTimersByTimeAsync(240);
    expect(results).toHaveLength(0);
    expect(runtime.debug.getState()).toMatchObject({ paused: true, queued: 2, running: 0 });

    runtime.debug.stepInference(1);
    expect(results).toHaveLength(1);
    expect(runtime.debug.getState()).toMatchObject({ queued: 1, running: 0 });
    runtime.debug.failNextInference();
    runtime.debug.stepInference(1);
    await request;
    expect(results).toHaveLength(2);
    expect(results[1].ok).toBe(false);

    const staleResults: unknown[] = [];
    runtime.debug.setInferencePaused(false);
    const staleRequest = runtime.detectImages('yolov8n-coco', [paths[0]], (item) => {
      staleResults.push(item);
    });
    runtime.debug.reset();
    await staleRequest;
    await vi.advanceTimersByTimeAsync(500);
    expect(staleResults).toHaveLength(0);
    expect(runtime.debug.getState()).toMatchObject({ queued: 0, running: 0, completed: 0, failed: 0 });
  });

  it('超过一个逻辑 Batch 时不会截断尾部图片', async () => {
    const runtime = new BrowserDebugRuntime();
    const paths = Array.from({ length: 9 }, (_, index) => `browser-debug://test/${index}.png`);
    const results: RuntimeYoloProgressItem[] = [];

    runtime.debug.setInferencePaused(true);
    const request = runtime.detectImages('yolov8n-coco', paths, (item) => results.push(item));
    expect(runtime.debug.getState()).toMatchObject({ queued: 9, completed: 0 });
    runtime.debug.stepInference(8);
    expect(results).toHaveLength(8);
    expect(runtime.debug.getState()).toMatchObject({ queued: 1, completed: 8 });
    runtime.debug.stepInference(1);
    await request;

    expect(results).toHaveLength(9);
    expect(results[results.length - 1]?.imagePath).toBe(paths[8]);
  });

  it('浏览器文件选择与拖放都会注册虚拟文件', async () => {
    const runtime = new BrowserDebugRuntime();
    const image = new File(['image'], 'leaf.png', { type: 'image/png' });
    const markdown = new File(['# note'], 'notes.md', { type: 'text/markdown' });
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      Object.defineProperty(this, 'files', {
        configurable: true,
        value: [image, markdown],
      });
      this.dispatchEvent(new Event('change'));
    });

    const selected = await runtime.pickFiles({ multiple: true });
    click.mockRestore();

    expect(selected).toHaveLength(2);
    expect(selected[0]).toMatchObject({
      name: 'leaf.png',
      path: 'browser-debug://uploads/1/leaf.png',
      file: image,
    });

    const drops: RuntimeDropEvent[] = [];
    const unlisten = await runtime.subscribeDrop((event) => drops.push(event));
    const enter = new Event('dragenter', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperties(enter, {
      clientX: { value: 24 },
      clientY: { value: 48 },
    });
    document.dispatchEvent(enter);
    const over = new Event('dragover', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperties(over, {
      clientX: { value: 24 },
      clientY: { value: 48 },
    });
    document.dispatchEvent(over);
    const drop = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperties(drop, {
      dataTransfer: { value: { files: [new File(['photo'], 'drop.jpg', { type: 'image/jpeg' })] } },
      clientX: { value: 24 },
      clientY: { value: 48 },
    });
    document.dispatchEvent(drop);
    unlisten();

    const tree = await runtime.invoke<WorkspaceFileNode>('list_workspace_files');
    expect(drops.map((event) => event.type)).toEqual(['enter', 'over', 'drop']);
    expect(drops[2]).toMatchObject({ position: { x: 24, y: 48 } });
    expect(drops[2].files[0].path).toBe('browser-debug://uploads/3/drop.jpg');
    expect(tree.children.some((node) => node.name === 'uploads')).toBe(true);
  });

  it('重置会让旧 Agent 异步回复失效', async () => {
    vi.useFakeTimers();
    const runtime = new BrowserDebugRuntime();
    const events: RuntimeAgentReplyDelta[] = [];
    await runtime.listen('lian-agent-event', (event) => {
      if ('kind' in event) events.push(event);
    });

    const reply = runtime.invoke('send_message', {
      conversationId: 'browser-debug',
      content: '请检查图片',
      requestId: 'stale-agent-request',
    });
    const rejection = expect(reply).rejects.toThrow('Agent 请求已取消');
    runtime.debug.reset();
    await vi.advanceTimersByTimeAsync(200);

    await rejection;
    expect(events).toHaveLength(0);
    expect((await runtime.invoke<WorkspaceSnapshot>('get_workspace_snapshot')).messages).toHaveLength(0);
  });

  it('外部 YOLO 任务失败后可以复用任务 ID 重试', async () => {
    vi.useFakeTimers();
    const runtime = new BrowserDebugRuntime();
    const events: Array<{ id: string; status: string }> = [];
    await runtime.listen('lian-yolo-event', (event) => {
      if (event.imagePath) events.push({ id: event.id, status: event.status });
    });

    runtime.debug.loadScenario('yolo');
    runtime.debug.setInferencePaused(true);
    await Promise.resolve();
    expect(runtime.debug.getState()).toMatchObject({ paused: true, queued: 8 });

    runtime.debug.failNextInference();
    runtime.debug.stepInference(1);
    expect(runtime.debug.getState()).toMatchObject({ queued: 7, failed: 1 });
    const failedId = events.find((event) => event.status === 'error')?.id;
    expect(failedId).toBeDefined();

    runtime.debug.retryFailedInference();
    expect(runtime.debug.getState()).toMatchObject({ queued: 8, failed: 0 });
    expect(events.some((event) => event.id === failedId && event.status === 'queued')).toBe(true);
    runtime.debug.stepInference(8);
    expect(runtime.debug.getState()).toMatchObject({ queued: 0, completed: 8, failed: 0 });
  });

  it('全流程场景提供可确认并完成的模拟任务计划', async () => {
    vi.useFakeTimers();
    const runtime = new BrowserDebugRuntime();
    runtime.debug.loadScenario('full');

    const snapshot = await runtime.invoke<WorkspaceSnapshot>('get_workspace_snapshot');
    const plan = snapshot.taskPlans[0];
    expect(plan.status).toBe('awaiting_confirmation');
    expect(snapshot.project?.name).toBe('浏览器调试育种项目');

    await runtime.invoke<WorkflowRun>('confirm_task_plan', { planId: plan.id });
    const running = await runtime.invoke<WorkflowRun>('start_task_plan_run', { planId: plan.id });
    expect(running.status).toBe('running');
    await vi.advanceTimersByTimeAsync(500);

    const completed = await runtime.invoke<WorkspaceSnapshot>('get_workspace_snapshot');
    expect(completed.workflowRuns[0].status).toBe('succeeded');
  });

  it('显式调试 URL 返回 BrowserDebugRuntime 单例', () => {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    window.history.replaceState({}, '', '/?debug=1');
    resetFrontendRuntimeForTests();
    const runtime = getFrontendRuntime();
    expect(runtime.mode).toBe('browser-debug');
    expect(runtime.debug).toBeDefined();
  });
});
