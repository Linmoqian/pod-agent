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
import MagneticCard from './MagneticCard';
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
          <MagneticCard
            key={dataset.id}
            className={`${styles.card} ${quality ? styles.interactiveCard : ''}`}
            enabled={Boolean(quality)}
            onClick={() => quality && onOpenArtifact(quality)}
          >
            <span>{dataset.name}</span>
            <small>
              {dataset.schema.traits?.length ?? 0} 个性状 · v{dataset.version}
            </small>
            <Tag color={statusColor(dataset.qualityStatus)}>
              {dataset.qualityStatus}
            </Tag>
          </MagneticCard>
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
        <MagneticCard
          key={artifact.id}
          className={`${styles.card} ${styles.interactiveCard}`}
          onClick={() => onOpenArtifact(artifact)}
        >
          <span>{artifact.name}</span>
          <small>{artifact.artifactType}</small>
          <Tag color={statusColor(artifact.status)}>{artifact.status}</Tag>
        </MagneticCard>
      ))}
    </div>
  );
}

function MaterialCards({ snapshot }: Pick<WorkbenchPanelProps, 'snapshot'>) {
  const materials = snapshot.materials ?? [];
  if (!materials.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="导入数据后建立材料身份" />;
  }
  return (
    <div className={styles.stack}>
      {materials.map((material) => (
        <div key={material.id} className={styles.card}>
          <span>{material.displayName}</span>
          <small>{material.canonicalCode}</small>
        </div>
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
        <span>
          {snapshot.overview
            ? `${snapshot.overview.materialCount} 材料 · ${snapshot.overview.executionCount} 次执行`
            : '当前上下文'}
        </span>
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
          {
            key: 'material',
            label: `材料 ${snapshot.materials?.length ?? 0}`,
            children: <MaterialCards snapshot={snapshot} />,
          },
        ]}
      />
    </aside>
  );
}
