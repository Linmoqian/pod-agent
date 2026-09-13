/*
 * lian@育种台数据优先工作区：统一问题/数据入口、任务时间线与可追溯结果。
 * Created on 2026-09-12
 * Updated on 2026-09-13
 * @author: https://github.com/Linmoqian
 */

import { Button, Popconfirm, Select, Spin } from 'antd';
import { lazy, Suspense, useState } from 'react';

import AppIcon from '../components/common/AppIcon';
import ResponsiveWorkbench from '../features/workspace/components/ResponsiveWorkbench';
import WorkspaceComposer from '../features/workspace/components/WorkspaceComposer';
import WorkspaceTimeline from '../features/workspace/components/WorkspaceTimeline';
import useWorkspaceController from '../features/workspace/hooks/useWorkspaceController';
import IconRail from './IconRail';
import styles from './AppLayout.module.css';

const ArtifactDrawer = lazy(
  () => import('../features/workspace/components/ArtifactDrawer'),
);

type ProjectHeaderProps = {
  projectId: string;
  projects: { id: string; name: string; status: string }[];
  datasetCount: number;
  artifactCount: number;
  materialCount: number;
  onSwitchProject: (projectId: string) => void;
  onCreateProject: (name: string) => void;
  onArchiveProject: () => void;
};

function ProjectHeader(props: ProjectHeaderProps) {
  const createProject = () => {
    const name = window.prompt('新项目名称');
    if (name?.trim()) props.onCreateProject(name.trim());
  };

  return (
    <header className={styles.header}>
      <div className={styles.projectContext}>
        <div className={styles.eyebrow}>
          <span className={styles.statusDot} aria-hidden />
          <span>育种研究工作区</span>
        </div>
        <div className={styles.projectRow}>
          <h1>lian</h1>
          <span className={styles.divider} aria-hidden />
          <span className={styles.projectLabel}>当前项目</span>
          <Select
            variant="borderless"
            value={props.projectId}
            options={props.projects
              .filter((item) => item.status === 'active')
              .map((item) => ({ value: item.id, label: item.name }))}
            onChange={props.onSwitchProject}
          />
        </div>
      </div>
      <div className={styles.headerActions}>
        <div className={styles.contextStats} aria-label="项目概览">
          <span>
            <b>{props.datasetCount}</b> 数据集
          </span>
          <span>
            <b>{props.artifactCount}</b> 结果
          </span>
          <span>
            <b>{props.materialCount}</b> 材料
          </span>
        </div>
        <Button className={styles.newProject} onClick={createProject}>
          <AppIcon name="add" size={15} />
          新建项目
        </Button>
        <Popconfirm title="归档当前项目？" onConfirm={props.onArchiveProject}>
          <Button
            className={styles.archiveButton}
            type="text"
            aria-label="归档当前项目"
          >
            <AppIcon name="delete" size={16} />
          </Button>
        </Popconfirm>
      </div>
    </header>
  );
}

export default function AppLayout() {
  const controller = useWorkspaceController();
  const { snapshot } = controller;
  const [artifactDrawerLoaded, setArtifactDrawerLoaded] = useState(false);

  if (!snapshot) {
    return (
      <div className={styles.loading}>
        <Spin description="正在恢复科研工作区" />
      </div>
    );
  }

  const latestPlan = snapshot.taskPlans[0];
  const latestRun = latestPlan
    ? snapshot.workflowRuns.find((run) => run.taskPlanId === latestPlan.id)
    : undefined;

  return (
    <div className={styles.layout}>
      <IconRail
        workbenchOpen={controller.workbenchOpen}
        onToggleWorkbench={() => controller.setWorkbenchOpen((value) => !value)}
      />
      <main className={styles.main}>
        <ProjectHeader
          projectId={snapshot.project.id}
          projects={controller.projects}
          datasetCount={snapshot.datasets.length}
          artifactCount={snapshot.artifacts.length}
          materialCount={snapshot.materials?.length ?? 0}
          onSwitchProject={(value) => void controller.switchProject(value)}
          onCreateProject={(name) => void controller.createProject(name)}
          onArchiveProject={() => void controller.archiveProject()}
        />
        <section className={styles.workspace}>
          <WorkspaceTimeline
            messages={snapshot.messages}
            inspection={controller.inspection}
            mappingEdits={controller.mappingEdits}
            onMappingChange={(sourceId, value) =>
              controller.setMappingEdits((current) => ({
                ...current,
                [sourceId]: value,
              }))
            }
            onRegister={(candidates, projectId, importSessionId, resolutions) =>
              void controller.registerCandidates(
                candidates,
                projectId,
                importSessionId,
                resolutions,
              )
            }
          />
          <WorkspaceComposer
            intent={controller.intent}
            busy={controller.busy}
            onIntentChange={controller.setIntent}
            onChooseData={(directory) => void controller.chooseData(directory)}
            onSubmit={() => void controller.submitQuestion()}
          />
        </section>
      </main>
      <ResponsiveWorkbench
        open={controller.workbenchOpen}
        onClose={() => controller.setWorkbenchOpen(false)}
        snapshot={snapshot}
        latestPlan={latestPlan}
        latestRun={latestRun}
        activeRunId={controller.activeRunId}
        busy={controller.busy}
        onConfirm={(planId) => void controller.confirmPlan(planId)}
        onCancel={(runId) => void controller.cancelWorkflow(runId)}
        onOpenArtifact={(artifact) => {
          setArtifactDrawerLoaded(true);
          controller.setSelectedArtifact(artifact);
        }}
      />
      {artifactDrawerLoaded && (
        <Suspense fallback={null}>
          <ArtifactDrawer
            artifact={controller.selectedArtifact}
            onClose={() => controller.setSelectedArtifact(null)}
          />
        </Suspense>
      )}
      {controller.busy && (
        <div className={styles.busy}>
          <Spin />
        </div>
      )}
    </div>
  );
}
