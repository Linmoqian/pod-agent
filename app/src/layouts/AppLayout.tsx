/*
 * lian@育种台会话优先布局：lian 永远可聊，数据让它可做，项目让它可持续。
 * Created on 2026-09-12
 * Updated on 2026-09-14
 * @author: https://github.com/Linmoqian
 */

import { Plus, Trash2 } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import WorkbenchPanel from '../features/workspace/components/WorkbenchPanel';
import WorkspaceComposer from '../features/workspace/components/WorkspaceComposer';
import WorkspaceTimeline from '../features/workspace/components/WorkspaceTimeline';
import useWorkspaceController from '../features/workspace/hooks/useWorkspaceController';
import AgentShell from './AgentShell';
import styles from './AppLayout.module.css';

const ArtifactDrawer = lazy(
  () => import('../features/workspace/components/ArtifactDrawer'),
);

type ContextHeaderProps = {
  contextLabel: string;
  inProject: boolean;
  projects: { id: string; name: string; status: string }[];
  datasetCount: number;
  artifactCount: number;
  materialCount: number;
  onSwitchProject: (projectId: string) => void;
  onCreateProject: (name: string) => void;
  onArchiveProject: () => void;
  onStartNewConversation: () => void;
  onPromoteConversation: (name: string) => void;
};

function ContextHeader(props: ContextHeaderProps) {
  const [naming, setNaming] = useState<'create' | 'save' | null>(null);
  const [name, setName] = useState('');
  const createProject = () => {
    setName('');
    setNaming('create');
  };
  const promoteConversation = () => {
    setName('');
    setNaming('save');
  };

  return (
    <header className={styles.header}>
      <Dialog
        open={naming !== null}
        onOpenChange={(open) => {
          if (!open) setNaming(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {naming === 'create' ? '新建项目' : '保存为项目'}
            </DialogTitle>
            <DialogDescription>
              给研究起一个名字，方便之后继续。
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              if (naming === 'create') props.onCreateProject(name.trim());
              else props.onPromoteConversation(name.trim());
              setNaming(null);
            }}
          >
            <Input
              aria-label="项目名称"
              placeholder="例如：大豆多环境试验"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              maxLength={120}
            />
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setNaming(null)}
              >
                取消
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                确定
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <div className={styles.projectContext}>
        <div className={styles.eyebrow}>
          <span className={styles.statusDot} aria-hidden />
          <span>育种研究对话</span>
        </div>
        <div className={styles.projectRow}>
          <h1>lian</h1>
          <span className={styles.divider} aria-hidden />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={styles.contextSwitcher}>
                <span>{props.contextLabel}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem disabled>
                当前 · {props.contextLabel}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {props.projects
                .filter((item) => item.status === 'active')
                .map((item) => (
                  <DropdownMenuItem
                    key={`project:${item.id}`}
                    onSelect={() => props.onSwitchProject(item.id)}
                  >
                    {item.name}
                  </DropdownMenuItem>
                ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={props.onStartNewConversation}>
                新的临时会话
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={props.inProject}
                onSelect={promoteConversation}
              >
                保存为项目…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={createProject}>
                新建项目…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className={styles.headerActions}>
        {props.inProject && (
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
        )}
        {!props.inProject && (
          <Button
            variant="ghost"
            className={styles.newProject}
            onClick={promoteConversation}
            aria-label="保存为项目"
          >
            <Plus size={15} strokeWidth={1.75} />
            保存为项目
          </Button>
        )}
        {props.inProject && (
          <Button
            variant="ghost"
            className={styles.newProject}
            onClick={createProject}
          >
            <Plus size={15} strokeWidth={1.75} />
            新建项目
          </Button>
        )}
        {props.inProject && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                className={styles.archiveButton}
                aria-label="归档当前项目"
              >
                <Trash2 size={16} strokeWidth={1.75} />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>归档当前项目？</AlertDialogTitle>
                <AlertDialogDescription>
                  归档后项目将从活跃列表移除,会话数据保留。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={props.onArchiveProject}>
                  归档
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
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
      <div className={styles.loading} role="status">
        <div className={styles.loadingHeader}><span /><i /><i /></div>
        <div className={styles.loadingMessages}><span /><span /><span /><span /></div>
        <div className={styles.loadingComposer}><span /><b /></div>
        <strong>正在连接 lian</strong>
      </div>
    );
  }

  const project = snapshot.project;
  const latestPlan = snapshot.taskPlans[0];
  const latestRun = latestPlan
    ? snapshot.workflowRuns.find((run) => run.taskPlanId === latestPlan.id)
    : undefined;

  return (
    <AgentShell
      projects={controller.projects}
      projectId={project?.id}
      busy={controller.busy}
      onNewConversation={() => void controller.startNewConversation()}
      onSwitchProject={(id) => void controller.switchProject(id)}
      workbenchOpen={controller.workbenchOpen}
      onToggleWorkbench={() => controller.setWorkbenchOpen((value) => !value)}
      workbench={
        <WorkbenchPanel
          embedded
          snapshot={snapshot}
          latestPlan={latestPlan}
          latestRun={latestRun}
          activeRunId={controller.activeRunId}
          busy={controller.busy}
          onConfirm={(id) => void controller.confirmPlan(id)}
          onCancel={(id) => void controller.cancelWorkflow(id)}
          onOpenArtifact={(artifact) => {
            setArtifactDrawerLoaded(true);
            controller.setSelectedArtifact(artifact);
          }}
        />
      }
    >
      <main className={styles.main}>
        <ContextHeader
          contextLabel={project ? project.name : '临时会话'}
          inProject={Boolean(project)}
          projects={controller.projects}
          datasetCount={snapshot.datasets.length}
          artifactCount={snapshot.artifacts.length}
          materialCount={snapshot.materials?.length ?? 0}
          onSwitchProject={(value) => void controller.switchProject(value)}
          onCreateProject={(name) => void controller.createProject(name)}
          onArchiveProject={() => void controller.archiveProject()}
          onStartNewConversation={() => void controller.startNewConversation()}
          onPromoteConversation={(name) =>
            void controller.promoteCurrentConversation(name)
          }
        />
        <section className={styles.workspace}>
          <WorkspaceTimeline
            key={snapshot.conversation.id}
            messages={snapshot.messages}
            onSuggestion={(value) => {
              controller.setIntent(value);
              document
                .querySelector<HTMLTextAreaElement>(
                  'textarea[aria-label="研究问题"]',
                )
                ?.focus();
            }}
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
      {artifactDrawerLoaded && (
        <Suspense fallback={null}>
          <ArtifactDrawer
            artifact={controller.selectedArtifact}
            onClose={() => controller.setSelectedArtifact(null)}
          />
        </Suspense>
      )}
    </AgentShell>
  );
}
