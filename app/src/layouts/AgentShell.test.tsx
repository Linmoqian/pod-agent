/* 验证停靠布局、键盘调宽与窄屏对话入口。Created on 2026-09-14 @author: https://github.com/Linmoqian */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import AgentShell from './AgentShell';
import { isTauri } from '@tauri-apps/api/core';
import type { YoloTask } from '../features/workspace/components/YoloTaskCard';

vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tauri-apps/api/core')>(),
  isTauri: vi.fn(() => false),
}));

vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ onDragDropEvent: vi.fn(async () => vi.fn()) }) }));

vi.mock('../features/settings/components/SettingsModal', () => ({
  default: () => null,
}));
const props = {
  workbenchOpen: true,
  onToggleWorkbench: vi.fn(),
  projects: [],
  busy: false,
  onNewConversation: vi.fn(),
  onSwitchProject: vi.fn(),
  onOpenYoloResults: vi.fn(),
  yoloTask: {
    photos: [],
    models: [],
    modelId: '',
    setModelId: vi.fn(),
    paused: false,
    setPaused: vi.fn(),
    adding: false,
    dragging: false,
    error: '',
    add: vi.fn(),
    loadResultPreview: vi.fn(),
    loadImagePreview: vi.fn(),
    exportCsv: vi.fn(),
    retry: vi.fn(),
  } as unknown as YoloTask,
};
const shell = () => (
  <AgentShell
    {...props}
    workbench={<input aria-label="上下文草稿" defaultValue="保留内容" />}
  >
    <textarea aria-label="对话草稿" defaultValue="未发送问题" />
  </AgentShell>
);
beforeEach(() => {
  window.localStorage.removeItem('lian.chat-layout.v1');
  vi.clearAllMocks();
  vi.mocked(isTauri).mockReturnValue(false);
});

it.each([
  ['MacIntel', true, '⌘B', true],
  ['MacIntel', false, '⌘B', false],
  ['Win32', true, 'Ctrl+B', false],
])('顶部栏适配 %s，桌面环境 %s', (platform, native, shortcut, inset) => {
  const platformMock = vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
  vi.mocked(isTauri).mockReturnValue(native);
  try {
    render(shell());
    const header = screen.getByRole('banner', { name: '工作空间顶部栏' });
    expect(header.hasAttribute('data-native-mac')).toBe(inset);
    expect(header.hasAttribute('data-tauri-drag-region')).toBe(native);
    const button = screen.getByTitle(`左侧边栏 · ${shortcut}`);
    expect(button).not.toHaveAttribute('data-tauri-drag-region');
    fireEvent.click(button);
    expect(screen.getByLabelText('展开左侧边栏')).toBeInTheDocument();
  } finally {
    platformMock.mockRestore();
  }
});

it('顶部边栏按钮和快捷键跟随左右停靠位置', () => {
  render(shell());
  fireEvent.click(screen.getByLabelText('移动会话侧栏到右侧'));

  fireEvent.click(screen.getByLabelText('收起左侧边栏'));
  expect(props.onToggleWorkbench).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByLabelText('收起右侧边栏'));
  expect(screen.getByLabelText('展开右侧边栏')).toBeInTheDocument();

  vi.clearAllMocks();
  fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
  expect(props.onToggleWorkbench).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(window, { key: 'b', ctrlKey: true, shiftKey: true });
  expect(screen.getByLabelText('收起右侧边栏')).toBeInTheDocument();
});

it('换位保留对话和上下文的 DOM 与输入状态', () => {
  render(shell());
  const draft = screen.getByLabelText('对话草稿');
  const context = screen.getByLabelText('上下文草稿');
  fireEvent.click(screen.getByLabelText('移动会话侧栏到右侧'));
  expect(screen.getByLabelText('会话侧栏')).toHaveAttribute(
    'data-side',
    'right',
  );
  expect(screen.getByLabelText('育种台')).toHaveAttribute('data-side', 'left');
  expect(screen.getByLabelText('对话草稿')).toBe(draft);
  expect(screen.getByLabelText('上下文草稿')).toBe(context);
});

it('键盘调宽遵循左右方向、上下限并提供刷新应用入口', () => {
  render(shell());
  const separator = screen.getByRole('separator', { name: '调整会话侧栏宽度' });
  fireEvent.keyDown(separator, { key: 'ArrowRight' });
  expect(separator).toHaveAttribute('aria-valuenow', '264');
  fireEvent.keyDown(separator, { key: 'End' });
  fireEvent.keyDown(separator, { key: 'ArrowRight' });
  expect(separator).toHaveAttribute('aria-valuenow', '420');
  fireEvent.click(screen.getByLabelText('移动会话侧栏到右侧'));
  fireEvent.keyDown(separator, { key: 'ArrowRight' });
  expect(separator).toHaveAttribute('aria-valuenow', '404');
  expect(screen.getByLabelText('刷新应用')).toBeInTheDocument();
});

it('指针拖动可换位和调宽，取消拖动不改变停靠位置', () => {
  render(shell());
  const pointer = (element: Element, type: string, x: number) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: x,
      button: 0,
    });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      isPrimary: { value: true },
    });
    fireEvent(element, event);
  };
  const grip = screen.getByLabelText('拖动会话侧栏，或用左右方向键换位');
  Object.defineProperty(grip, 'setPointerCapture', { value: vi.fn() });
  pointer(grip, 'pointerdown', 100);
  expect(screen.getByLabelText('会话侧栏')).toHaveAttribute(
    'data-drag-source',
    'true',
  );
  expect(screen.getByLabelText('育种台')).toHaveAttribute(
    'data-drag-peer',
    'true',
  );
  expect(screen.getByLabelText('对话草稿').closest('[data-drag-peer]')).toBeNull();
  pointer(grip, 'pointermove', 900);
  expect(screen.getByText('释放以停靠到右侧').parentElement).toHaveAttribute(
    'role',
    'status',
  );
  pointer(grip, 'pointerup', 900);
  expect(screen.getByLabelText('会话侧栏')).toHaveAttribute(
    'data-side',
    'right',
  );
  expect(screen.getByLabelText('会话侧栏')).not.toHaveAttribute(
    'data-drag-source',
  );
  expect(screen.getByLabelText('育种台')).not.toHaveAttribute('data-drag-peer');
  const separator = screen.getByRole('separator', { name: '调整会话侧栏宽度' });
  Object.defineProperty(separator, 'setPointerCapture', { value: vi.fn() });
  pointer(separator, 'pointerdown', 900);
  pointer(separator, 'pointermove', 860);
  pointer(separator, 'pointerup', 860);
  expect(separator).toHaveAttribute('aria-valuenow', '288');
  pointer(grip, 'pointerdown', 900);
  pointer(grip, 'pointermove', -100);
  pointer(grip, 'pointercancel', -100);
  expect(screen.getByLabelText('会话侧栏')).not.toHaveAttribute(
    'data-drag-source',
  );
  expect(screen.getByLabelText('育种台')).not.toHaveAttribute('data-drag-peer');
  expect(screen.getByLabelText('会话侧栏')).toHaveAttribute(
    'data-side',
    'right',
  );
});

it('设置只保留左下角入口', () => {
  render(shell());
  expect(screen.getAllByLabelText('打开设置')).toHaveLength(1);
  expect(
    screen.getByRole('navigation', { name: '会话与项目' }),
  ).toContainElement(screen.getByLabelText('打开设置'));
  expect(
    screen.getByRole('banner', { name: '工作空间顶部栏' }),
  ).not.toContainElement(screen.getByLabelText('打开设置'));
});

it('Agent 推理任务不抢占当前对话视图', () => {
  const task = {
    ...props.yoloTask,
    photos: [{
      id: 'agent-yolo-1',
      path: '/photos/IMG_0001.png',
      name: 'IMG_0001.png',
      external: true,
      status: 'running',
    }],
  } as unknown as YoloTask;
  render(
    <AgentShell
      {...props}
      yoloTask={task}
      workbench={<input aria-label="上下文草稿" defaultValue="保留内容" />}
    >
      <textarea aria-label="对话草稿" defaultValue="未发送问题" />
    </AgentShell>,
  );
  expect(props.onOpenYoloResults).not.toHaveBeenCalled();
  expect(screen.getByLabelText('对话草稿')).toBeInTheDocument();
});

it('重新挂载恢复位置与宽度，损坏的偏好安全回退', () => {
  const view = render(shell());
  fireEvent.click(screen.getByLabelText('移动会话侧栏到右侧'));
  fireEvent.keyDown(screen.getByRole('separator', { name: '调整育种台宽度' }), {
    key: 'End',
  });
  view.unmount();
  const next = render(shell());
  expect(screen.getByLabelText('会话侧栏')).toHaveAttribute(
    'data-side',
    'right',
  );
  expect(
    screen.getByRole('separator', { name: '调整育种台宽度' }),
  ).toHaveAttribute('aria-valuenow', '480');
  next.unmount();
  localStorage.setItem('lian.chat-layout.v1', '{bad');
  render(shell());
  expect(
    screen.getByRole('separator', { name: '调整育种台宽度' }),
  ).toHaveAttribute('aria-valuenow', '320');
});

it('窄屏默认显示对话，侧栏互斥且 Escape 关闭', async () => {
  const original = window.matchMedia;
  const media = vi
    .spyOn(window, 'matchMedia')
    .mockImplementation((query) => ({
      ...original(query),
      matches: query === '(max-width: 980px)',
    }));
  try {
    render(shell());
    expect(screen.queryByLabelText('会话侧栏')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('育种台')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('展开左侧边栏'));
    expect(screen.getByLabelText('会话侧栏')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('展开右侧边栏'));
    await waitFor(() =>
      expect(screen.queryByLabelText('会话侧栏')).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText('育种台')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByLabelText('展开左侧边栏')).toBeInTheDocument();
  } finally {
    media.mockRestore();
  }
});
