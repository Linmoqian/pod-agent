/*
 * 验证工作区多源登记与运行取消的关键交互契约。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { render, screen, waitFor } from '@testing-library/react';
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
const emptySnapshot = {
  project,
  datasets: [],
  artifacts: [],
  taskPlans: [],
  workflowRuns: [],
  messages: [],
};

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.open.mockReset();
});

it('歧义确认后一次登记全部可分析文件', async () => {
  const candidates = ['source-a', 'source-b'].map((sourceId) => ({
    sourceId,
    name: `${sourceId}.csv`,
    format: 'csv',
    size: 120,
    checksum: `${sourceId}-checksum`,
    sheets: ['data'],
    rowCount: 8,
    columns: ['material_id', 'environment', 'height'],
    inferredMapping: {
      data: {
        material: 'material_id',
        environment: 'environment',
        replicate: null,
        block: null,
        trait: null,
        value: null,
        unit: null,
      },
    },
    traits: ['height'],
    ambiguities: ['data: 请确认字段角色'],
    supported: true,
  }));
  const dataset = {
    id: 'dataset-1',
    projectId: project.id,
    name: 'height',
    datasetType: 'phenotype',
    version: 1,
    schema: { traits: [] },
    source: {},
    metadata: {},
    qualityStatus: 'pass',
    supersedesId: null,
    createdAt: '2026-09-12',
  };
  mocks.open.mockResolvedValue(['/tmp/source-a.csv', '/tmp/source-b.csv']);
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === 'ensure_draft_project') return project;
    if (command === 'get_workspace_snapshot') return emptySnapshot;
    if (command === 'inspect_data_sources') {
      return { projectId: project.id, candidates };
    }
    if (command === 'register_datasets') return [dataset];
    if (command === 'submit_agent_intent') return {};
    throw new Error(`unexpected command: ${command}`);
  });
  const user = userEvent.setup();
  render(<Root />);
  await user.click(await screen.findByRole('button', { name: /添加数据/ }));
  await user.click(await screen.findByText('本地文件'));
  await user.click(
    await screen.findByRole('button', {
      name: '确认识别并登记全部可分析数据',
    }),
  );
  await waitFor(() =>
    expect(mocks.invoke).toHaveBeenCalledWith(
      'register_datasets',
      expect.objectContaining({
        registrations: expect.arrayContaining([
          expect.objectContaining({ sourceId: 'source-a' }),
          expect.objectContaining({ sourceId: 'source-b' }),
        ]),
      }),
    ),
  );
});

it('运行中的任务可发出取消请求', async () => {
  const plan = {
    id: 'plan-1',
    projectId: project.id,
    datasetId: 'dataset-1',
    title: '运行中任务',
    intent: '分析株高',
    traitId: 'height',
    planner: {},
    modelSpec: {},
    expectedArtifacts: [],
    status: 'running',
    createdAt: '2026-09-12',
    steps: [],
  };
  const run = {
    id: 'run-1',
    taskPlanId: plan.id,
    projectId: project.id,
    status: 'running',
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-09-12',
    finishedAt: null,
  };
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === 'ensure_draft_project') return project;
    if (command === 'get_workspace_snapshot') {
      return { ...emptySnapshot, taskPlans: [plan], workflowRuns: [run] };
    }
    if (command === 'cancel_workflow') return undefined;
    throw new Error(`unexpected command: ${command}`);
  });
  const user = userEvent.setup();
  render(<Root />);
  await user.click(await screen.findByRole('button', { name: '取消运行' }));
  expect(mocks.invoke).toHaveBeenCalledWith('cancel_workflow', {
    runId: 'run-1',
  });
});
