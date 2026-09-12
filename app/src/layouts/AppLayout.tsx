/*
 * lian@育种台数据优先工作区：统一问题/数据入口、任务时间线与可追溯结果。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { Spin, Tag } from 'antd';

import ArtifactDrawer from '../features/workspace/components/ArtifactDrawer';
import WorkbenchPanel from '../features/workspace/components/WorkbenchPanel';
import WorkspaceComposer from '../features/workspace/components/WorkspaceComposer';
import WorkspaceTimeline from '../features/workspace/components/WorkspaceTimeline';
import useWorkspaceController from '../features/workspace/hooks/useWorkspaceController';
import IconRail from './IconRail';
import styles from './AppLayout.module.css';

export default function AppLayout() {
  const controller = useWorkspaceController();
  const { snapshot } = controller;

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
        <header className={styles.header}>
          <div>
            <b>lian@育种台</b>
            <span>{snapshot.project.name}</span>
          </div>
          <Tag variant="filled">
            lian · {latestPlan?.planner.model ?? '规则计划器'}
          </Tag>
        </header>
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
            onRegister={(candidates, projectId) =>
              void controller.registerCandidates(candidates, projectId)
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
      {controller.workbenchOpen && (
        <WorkbenchPanel
          snapshot={snapshot}
          latestPlan={latestPlan}
          latestRun={latestRun}
          activeRunId={controller.activeRunId}
          busy={controller.busy}
          onConfirm={(planId) => void controller.confirmPlan(planId)}
          onCancel={(runId) => void controller.cancelWorkflow(runId)}
          onOpenArtifact={controller.setSelectedArtifact}
        />
      )}
      <ArtifactDrawer
        artifact={controller.selectedArtifact}
        onClose={() => controller.setSelectedArtifact(null)}
      />
      {controller.busy && (
        <div className={styles.busy}>
          <Spin />
        </div>
      )}
    </div>
  );
}
