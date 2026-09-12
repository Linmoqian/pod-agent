/*
 * 展示一次确认所需的模型计划、参数、风险与运行控制。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { Alert, Button, Tag } from 'antd';

import { statusColor } from '../status';
import type { TaskPlan, WorkflowRun } from '../types';
import styles from './WorkbenchPanel.module.css';

function listSpec(value: unknown) {
  return Array.isArray(value) ? value.join('、') : '—';
}

type TaskPlanPanelProps = {
  plan: TaskPlan;
  run?: WorkflowRun;
  runningId: string | null;
  busy: boolean;
  onConfirm: (planId: string) => void;
  onCancel: (runId: string) => void;
};

export default function TaskPlanPanel({
  plan,
  run,
  runningId,
  busy,
  onConfirm,
  onCancel,
}: TaskPlanPanelProps) {
  const canStart = [
    'awaiting_confirmation',
    'failed',
    'cancelled',
    'interrupted',
  ].includes(plan.status);
  return (
    <div className={styles.taskPanel}>
      <div className={styles.taskHeading}>
        <span>当前任务</span>
        <Tag color={statusColor(run?.status ?? plan.status)}>
          {run?.status ?? plan.status}
        </Tag>
      </div>
      <h3>{plan.title}</h3>
      <p>{plan.planner.summary || '环境固定；材料与材料×环境为随机效应。'}</p>
      <dl className={styles.specification}>
        <div>
          <dt>目标性状</dt>
          <dd>{plan.traitId}</dd>
        </div>
        <div>
          <dt>方法</dt>
          <dd>{String(plan.modelSpec.method ?? '—')}</dd>
        </div>
        <div>
          <dt>固定效应</dt>
          <dd>{listSpec(plan.modelSpec.fixedEffects)}</dd>
        </div>
        <div>
          <dt>随机效应</dt>
          <dd>{listSpec(plan.modelSpec.randomEffects)}</dd>
        </div>
        <div>
          <dt>预期结果</dt>
          <dd>{plan.expectedArtifacts.join('、')}</dd>
        </div>
      </dl>
      <div className={styles.steps}>
        {plan.steps.map((step, index) => (
          <div className={styles.step} key={step.id}>
            <span>
              {step.id === 'quality' || run?.status === 'succeeded'
                ? '✓'
                : index + 1}
            </span>
            <div>
              <b>{step.title}</b>
              <small>{step.toolId}</small>
            </div>
            <Tag>{step.riskLevel}</Tag>
          </div>
        ))}
      </div>
      {canStart && (
        <Button
          type="primary"
          block
          onClick={() => onConfirm(plan.id)}
          disabled={busy}
        >
          开始
        </Button>
      )}
      {runningId && (
        <Button danger block onClick={() => onCancel(runningId)}>
          取消运行
        </Button>
      )}
      {run?.errorMessage && (
        <Alert type="error" showIcon title={run.errorMessage} />
      )}
    </div>
  );
}
