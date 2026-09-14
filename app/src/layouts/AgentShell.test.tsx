/* 验证停靠布局、键盘调宽与窄屏对话入口。Created on 2026-09-14 @author: https://github.com/Linmoqian */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import AgentShell from './AgentShell';

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

it('键盘调宽遵循左右方向、上下限并可重置', () => {
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
  fireEvent.click(screen.getByLabelText('重置布局'));
  expect(separator).toHaveAttribute('aria-valuenow', '248');
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
  pointer(grip, 'pointermove', 900);
  pointer(grip, 'pointerup', 900);
  expect(screen.getByLabelText('会话侧栏')).toHaveAttribute(
    'data-side',
    'right',
  );
  const separator = screen.getByRole('separator', { name: '调整会话侧栏宽度' });
  Object.defineProperty(separator, 'setPointerCapture', { value: vi.fn() });
  pointer(separator, 'pointerdown', 900);
  pointer(separator, 'pointermove', 860);
  pointer(separator, 'pointerup', 860);
  expect(separator).toHaveAttribute('aria-valuenow', '288');
  pointer(grip, 'pointerdown', 900);
  pointer(grip, 'pointermove', -100);
  pointer(grip, 'pointercancel', -100);
  expect(screen.getByLabelText('会话侧栏')).toHaveAttribute(
    'data-side',
    'right',
  );
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

it('窄屏默认显示对话，侧栏互斥且 Escape 关闭', () => {
  const original = window.matchMedia;
  const media = vi
    .spyOn(window, 'matchMedia')
    .mockImplementation((query) => ({
      ...original(query),
      matches: query === '(max-width: 820px)',
    }));
  try {
    render(shell());
    expect(screen.queryByLabelText('会话侧栏')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('育种台')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('展开会话侧栏'));
    expect(screen.getByLabelText('会话侧栏')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByLabelText('展开会话侧栏')).toBeInTheDocument();
  } finally {
    media.mockRestore();
  }
});
