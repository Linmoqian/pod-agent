/*
 * 工作区头部的项目上下文与操作按钮。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import {
  Circle,
  Plus,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import styles from './AppLayout.module.css';

type ProjectContextControlsProps = {
  inProject: boolean;
  contextLabel: string;
  projects: { id: string; name: string; status: string }[];
  datasetCount: number;
  artifactCount: number;
  materialCount: number;
  developerMode: boolean;
  terminalOpen: boolean;
  busy: boolean;
  onSwitchProject: (projectId: string) => void;
  onStartNewConversation: () => void;
  onCreateProject: () => void;
  onArchiveProject: () => void;
  onOpenTerminal: () => void;
  onCloseUnsavedConversation: () => void;
};

export default function ContextHeaderActions({
  inProject,
  contextLabel,
  projects,
  datasetCount,
  artifactCount,
  materialCount,
  developerMode,
  terminalOpen,
  busy,
  onSwitchProject,
  onStartNewConversation,
  onCreateProject,
  onArchiveProject,
  onOpenTerminal,
  onCloseUnsavedConversation,
}: ProjectContextControlsProps) {
  return (
    <>
      {inProject && (
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
                  <span>{contextLabel}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className={styles.contextMenu}>
                <DropdownMenuItem disabled>
                  当前 · {contextLabel}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {projects
                  .filter((item) => item.status === 'active')
                  .map((item) => (
                    <DropdownMenuItem
                      key={`project:${item.id}`}
                      onSelect={() => onSwitchProject(item.id)}
                    >
                      {item.name}
                    </DropdownMenuItem>
                  ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onStartNewConversation}>
                  新的临时会话
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onCreateProject}>
                  新建项目…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
      <div className={styles.headerActions}>
        {developerMode && !terminalOpen && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={styles.terminalButton}
            onClick={onOpenTerminal}
          >
            <Terminal size={15} aria-hidden />
            终端
          </Button>
        )}
        {inProject && (
          <div className={styles.contextStats} aria-label="项目概览">
            <span>
              <b>{datasetCount}</b> 数据集
            </span>
            <span>
              <b>{artifactCount}</b> 结果
            </span>
            <span>
              <b>{materialCount}</b> 材料
            </span>
          </div>
        )}
        {!inProject && (
          <button
            type="button"
            className={styles.unsavedDot}
            aria-label="关闭未保存的临时会话"
            title="未保存的临时会话，点击关闭"
            disabled={busy}
            onClick={onCloseUnsavedConversation}
          >
            <Circle
              className={styles.unsavedDotIcon}
              size={8}
              fill="currentColor"
              aria-hidden
            />
            <X
              className={styles.unsavedCloseIcon}
              size={14}
              strokeWidth={1.9}
              aria-hidden
            />
          </button>
        )}
        {inProject && (
          <Button
            variant="ghost"
            className={styles.newProject}
            onClick={onCreateProject}
          >
            <Plus size={15} strokeWidth={1.75} />
            新建项目
          </Button>
        )}
        {inProject && (
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
                <AlertDialogAction onClick={onArchiveProject}>
                  归档
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </>
  );
}
