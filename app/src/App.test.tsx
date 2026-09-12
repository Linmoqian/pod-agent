/*
 * 验证 lian 数据优先首页、任务计划与 Artifact 血缘入口。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Root from './Root';

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

function mockSnapshot(value = emptySnapshot) {
  mocks.invoke.mockImplementation(async (command: string) => {
    if (command === 'ensure_draft_project') return project;
    if (command === 'get_workspace_snapshot') return value;
    throw new Error(`unexpected command: ${command}`);
  });
}

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.open.mockReset();
});

describe('lian 工作区', () => {
  it('显示安静的数据优先首页和统一入口', async () => {
    mockSnapshot();
    render(<Root />);
    expect(
      await screen.findByRole('heading', { name: '今天想研究什么？' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('研究问题')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /添加数据/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('育种台')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '任务' })).toBeInTheDocument();
  });

  it('已有 Dataset 时自然语言先生成待确认计划', async () => {
    const dataset = {
      id: 'dataset-1',
      projectId: project.id,
      name: '株高',
      datasetType: 'phenotype',
      version: 1,
      schema: {
        traits: [
          { id: 'plant_height', name: '株高', valueType: 'float', unit: 'cm' },
        ],
      },
      source: {},
      metadata: {},
      qualityStatus: 'pass',
      supersedesId: null,
      createdAt: '2026-09-12',
    };
    const planned = {
      ...emptySnapshot,
      datasets: [dataset],
      taskPlans: [
        {
          id: 'plan-1',
          projectId: project.id,
          datasetId: dataset.id,
          title: '株高多环境分析',
          intent: '比较株高',
          traitId: 'plant_height',
          planner: { mode: 'model', model: 'test/model' },
          modelSpec: {},
          expectedArtifacts: [],
          status: 'awaiting_confirmation',
          createdAt: '2026-09-12',
          steps: [
            {
              id: 'model',
              toolId: 'breeding.multi_environment_blup',
              title: '拟合混合模型与 BLUP',
              status: 'waiting',
              riskLevel: 'scientific_judgment',
            },
          ],
        },
      ],
    };
    let snapshotCalls = 0;
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'ensure_draft_project') return project;
      if (command === 'get_workspace_snapshot')
        return snapshotCalls++
          ? planned
          : { ...emptySnapshot, datasets: [dataset] };
      if (command === 'submit_agent_intent') return planned.taskPlans[0];
      throw new Error(`unexpected command: ${command}`);
    });
    const user = userEvent.setup();
    render(<Root />);
    const input = await screen.findByLabelText('研究问题');
    await user.type(input, '比较株高{enter}');
    expect(await screen.findByText('株高多环境分析')).toBeInTheDocument();
    expect(screen.getByText('plant_height')).toBeInTheDocument();
    expect(screen.getByText('scientific_judgment')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /开\s*始/ })).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledWith(
      'submit_agent_intent',
      expect.objectContaining({ intent: '比较株高' }),
    );
  });
});

describe('lian Artifact', () => {
  it('结果卡可打开 Artifact 血缘', async () => {
    const artifact = {
      id: 'artifact-1',
      projectId: project.id,
      artifactType: 'quality.report',
      name: '数据质量报告',
      status: 'pass',
      files: [],
      checksum: 'sha256',
      upstreamIds: [],
      producedByRunId: null,
      metadata: {},
      createdAt: '2026-09-12',
    };
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'ensure_draft_project') return project;
      if (command === 'get_workspace_snapshot')
        return { ...emptySnapshot, artifacts: [artifact] };
      if (command === 'get_artifact_detail')
        return { artifact, upstream: [], dataset: null, toolRuns: [] };
      throw new Error(`unexpected command: ${command}`);
    });
    const user = userEvent.setup();
    render(<Root />);
    await user.click(await screen.findByRole('tab', { name: '结果 1' }));
    await user.click(screen.getByRole('button', { name: /数据质量报告/ }));
    await waitFor(() =>
      expect(screen.getByText('Artifact 血缘')).toBeInTheDocument(),
    );
    expect(screen.getByText(/sha256/)).toBeInTheDocument();
  });
});
