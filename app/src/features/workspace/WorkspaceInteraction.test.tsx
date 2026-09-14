/*
 * 验证工作区输入防重与数据卡片的可访问语义。
 * Created on 2026-09-13
 * @author: https://github.com/Linmoqian
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import Root from '../../Root';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(async () => () => undefined),
  open: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.open }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: mocks.listen,
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: vi.fn(async () => () => undefined),
  }),
}));

const project = {
  id: 'project-1',
  name: '未命名育种项目',
  status: 'draft',
  createdAt: '2026-09-12',
  updatedAt: '2026-09-12',
};
const dataset = {
  id: 'dataset-1',
  projectId: project.id,
  name: '待质检株高',
  datasetType: 'phenotype',
  version: 1,
  schema: { traits: [] },
  source: {},
  metadata: {},
  qualityStatus: 'pending',
  supersedesId: null,
  createdAt: '2026-09-12',
};
const conversation = {
  id: 'conversation-1',
  projectId: project.id,
  title: '研究对话',
  status: 'active',
  createdAt: '2026-09-12',
  updatedAt: '2026-09-12',
};
const snapshot = {
  conversation,
  project,
  datasets: [dataset],
  artifacts: [],
  taskPlans: [],
  workflowRuns: [],
  messages: [],
};

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.listen.mockClear();
  mocks.open.mockReset();
});

it('忙碌时连续 Enter 只提交一次研究问题', async () => {
  let releaseSubmission: () => void = () => {};
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === 'ensure_active_conversation') return snapshot;
    if (command === 'list_projects') return [project];
    if (command === 'get_conversation_context') return snapshot;
    if (command === 'submit_agent_intent') {
      return new Promise((resolve) => {
        releaseSubmission = () => resolve(undefined);
      });
    }
    throw new Error(`unexpected command: ${command}`);
  });
  const user = userEvent.setup();
  render(<Root />);
  const input = await screen.findByLabelText('研究问题');
  await user.type(input, '比较株高{enter}{enter}');
  expect(
    mocks.invoke.mock.calls.filter(
      ([command]) => command === 'submit_agent_intent',
    ),
  ).toHaveLength(1);
  releaseSubmission();
});

it('自由对话在 Agent 返回前立即展示提问和生成中回复', async () => {
  const noDataSnapshot = { ...snapshot, datasets: [], project: null };
  let releaseReply: (value: typeof noDataSnapshot) => void = () => {};
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === 'ensure_active_conversation') return noDataSnapshot;
    if (command === 'list_projects') return [project];
    if (command === 'send_message') {
      return new Promise((resolve) => {
        releaseReply = resolve;
      });
    }
    if (command === 'get_conversation_context') return noDataSnapshot;
    throw new Error(`unexpected command: ${command}`);
  });
  const user = userEvent.setup();
  render(<Root />);
  const input = await screen.findByLabelText('研究问题');
  await user.type(input, '如何安排田间重复？{enter}');
  expect(await screen.findByText('如何安排田间重复？')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('正在生成回复');
  await waitFor(() =>
    expect(mocks.listen).toHaveBeenCalledWith(
      'lian-agent-event',
      expect.any(Function),
    ),
  );
  const listenCalls = mocks.listen.mock.calls as unknown as Array<
    [string, (event: { payload: unknown }) => void]
  >;
  const listener = listenCalls.find(
    ([eventName]) => eventName === 'lian-agent-event',
  )?.[1];
  if (!listener) throw new Error('未绑定 Agent 增量事件');
  listener({
    payload: {
      eventType: 'agent.reply.delta',
      conversationId: conversation.id,
      kind: 'thinking',
      delta: '先确认试验目标。',
    },
  });
  listener({
    payload: {
      eventType: 'agent.reply.delta',
      conversationId: conversation.id,
      kind: 'text',
      delta: '建议每个环境至少设置 3 个重复。',
    },
  });
  expect(await screen.findByText('先确认试验目标。')).toBeInTheDocument();
  expect(
    screen.getByText('建议每个环境至少设置 3 个重复。'),
  ).toBeInTheDocument();
  releaseReply(noDataSnapshot);
});

it('没有质量报告的数据卡不是无效按钮', async () => {
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === 'ensure_active_conversation') return snapshot;
    if (command === 'list_projects') return [project];
    if (command === 'get_conversation_context') return snapshot;
    throw new Error(`unexpected command: ${command}`);
  });
  const user = userEvent.setup();
  render(<Root />);
  await user.click(await screen.findByRole('tab', { name: '数据 1' }));
  expect(await screen.findByText('待质检株高')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /待质检株高/ }),
  ).not.toBeInTheDocument();
});

it('真实思考文本可展开或收起，正文保持独立显示', async () => {
  const assistantSnapshot = {
    ...snapshot,
    messages: [
      {
        id: 'assistant-1',
        conversationId: conversation.id,
        taskPlanId: null,
        role: 'assistant',
        content: '建议先检查重复数和环境信息。',
        reasoning: '先确认问题没有要求虚构数据结论。',
        createdAt: '2026-09-14',
      },
    ],
  };
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === 'ensure_active_conversation') return assistantSnapshot;
    if (command === 'list_projects') return [project];
    if (command === 'get_conversation_context') return assistantSnapshot;
    throw new Error(`unexpected command: ${command}`);
  });
  const user = userEvent.setup();
  render(<Root />);
  const toggle = await screen.findByRole('button', { name: '模型思考' });
  expect(screen.getByText('先确认问题没有要求虚构数据结论。')).toBeInTheDocument();
  expect(screen.getByText('建议先检查重复数和环境信息。')).toBeInTheDocument();
  await user.click(toggle);
  expect(screen.queryByText('先确认问题没有要求虚构数据结论。')).not.toBeInTheDocument();
  expect(screen.getByText('建议先检查重复数和环境信息。')).toBeInTheDocument();
});

it('普通浏览器缺少 Tauri IPC 时仍显示工作区预览', async () => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  try {
    render(<Root />);
    expect(await screen.findByText('今天想研究什么？')).toBeInTheDocument();
  } finally {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
  }
});
