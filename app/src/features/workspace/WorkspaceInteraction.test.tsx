/*
 * 验证工作区输入防重与数据卡片的可访问语义。
 * Created on 2026-09-13
 * @author: https://github.com/Linmoqian
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import Root from '../../Root';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), open: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: mocks.open }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => undefined),
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
const snapshot = {
  project,
  datasets: [dataset],
  artifacts: [],
  taskPlans: [],
  workflowRuns: [],
  messages: [],
};

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.open.mockReset();
});

it('忙碌时连续 Enter 只提交一次研究问题', async () => {
  let releaseSubmission: () => void = () => {};
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === 'ensure_draft_project') return project;
    if (command === 'list_projects') return [project];
    if (command === 'get_workspace_snapshot') return snapshot;
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

it('没有质量报告的数据卡不是无效按钮', async () => {
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === 'ensure_draft_project') return project;
    if (command === 'list_projects') return [project];
    if (command === 'get_workspace_snapshot') return snapshot;
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
