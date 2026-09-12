/*
 * lian 右侧育种台的任务、数据与结果上下文面板。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { Empty, Tabs, Tag } from 'antd';

import { statusColor } from '../status';
import type {
  Artifact,
  TaskPlan,
  WorkflowRun,
  WorkspaceSnapshot,
} from '../types';
import TaskPlanPanel from './TaskPlanPanel';
import styles from './WorkbenchPanel.module.css';

type WorkbenchPanelProps = {
  snapshot: WorkspaceSnapshot;
  latestPlan?: TaskPlan;
  latestRun?: WorkflowRun;
  activeRunId: string | null;
  busy: boolean;
  onConfirm: (planId: string) => void;
  onCancel: (runId: string) => void;
  onOpenArtifact: (artifact: Artifact) => void;
};

function DataCards({
  snapshot,
  onOpenArtifact,
}: Pick<WorkbenchPanelProps, 'snapshot' | 'onOpenArtifact'>) {
  if (!snapshot.datasets.length) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="尚未登记 Dataset"
      />
    );
  }
  return (
    <div className={styles.stack}>
      {snapshot.datasets.map((dataset) => {
        const quality = snapshot.artifacts.find(
          (artifact) =>
            artifact.artifactType === 'quality.report' &&
            artifact.upstreamIds.includes(dataset.id),
        );
        return (
          <button
            key={dataset.id}
            className={styles.card}
            onClick={() => quality && onOpenArtifact(quality)}
          >
            <span>{dataset.name}</span>
            <small>
              {dataset.schema.traits?.length ?? 0} 个性状 · v{dataset.version}
            </small>
            <Tag color={statusColor(dataset.qualityStatus)}>
              {dataset.qualityStatus}
            </Tag>
          </button>
        );
      })}
    </div>
  );
}

function ResultCards({
  snapshot,
  onOpenArtifact,
}: Pick<WorkbenchPanelProps, 'snapshot' | 'onOpenArtifact'>) {
  if (!snapshot.artifacts.length) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="运行后生成 Artifact"
      />
    );
  }
  return (
    <div className={styles.stack}>
      {snapshot.artifacts.map((artifact) => (
        <button
          key={artifact.id}
          className={styles.card}
          onClick={() => onOpenArtifact(artifact)}
        >
          <span>{artifact.name}</span>
          <small>{artifact.artifactType}</small>
          <Tag color={statusColor(artifact.status)}>{artifact.status}</Tag>
        </button>
      ))}
    </div>
  );
}

export default function WorkbenchPanel(props: WorkbenchPanelProps) {
  const { snapshot, latestPlan, latestRun, activeRunId, onOpenArtifact } =
    props;
  const runningId =
    activeRunId ?? (latestRun?.status === 'running' ? latestRun.id : null);
  const task = latestPlan ? (
    <TaskPlanPanel
      plan={latestPlan}
      run={latestRun}
      runningId={runningId}
      busy={props.busy}
      onConfirm={props.onConfirm}
      onCancel={props.onCancel}
    />
  ) : (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description="提出问题后，任务计划会出现在这里"
    />
  );
  return (
    <aside className={styles.panel}>
      <div className={styles.title}>
        <b>育种台</b>
        <span>当前上下文</span>
      </div>
      <Tabs
        items={[
          { key: 'task', label: '任务', children: task },
          {
            key: 'data',
            label: `数据 ${snapshot.datasets.length}`,
            children: (
              <DataCards snapshot={snapshot} onOpenArtifact={onOpenArtifact} />
            ),
          },
          {
            key: 'result',
            label: `结果 ${snapshot.artifacts.length}`,
            children: (
              <ResultCards
                snapshot={snapshot}
                onOpenArtifact={onOpenArtifact}
              />
            ),
          },
        ]}
      />
    </aside>
  );
}
