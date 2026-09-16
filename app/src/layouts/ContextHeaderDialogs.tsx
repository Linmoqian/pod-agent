/*
 * 工作区头部的命名与关闭确认弹窗。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import type { WorkspaceTab } from '../features/workspace/hooks/useWorkspaceController';
import styles from './AppLayout.module.css';

export type ContextHeaderNaming = 'create' | 'save' | 'rename-group' | null;

type ContextHeaderDialogsProps = {
  naming: ContextHeaderNaming;
  name: string;
  closingTab: WorkspaceTab | null;
  onNamingOpenChange: (open: boolean) => void;
  onNameChange: (value: string) => void;
  onSubmitNaming: () => Promise<void>;
  onCancelNaming: () => void;
  onCloseDialog: () => void;
  onDiscardClose: () => void;
  onSaveAndClose: () => void;
};

export default function ContextHeaderDialogs({
  naming,
  name,
  closingTab,
  onNamingOpenChange,
  onNameChange,
  onSubmitNaming,
  onCancelNaming,
  onCloseDialog,
  onDiscardClose,
  onSaveAndClose,
}: ContextHeaderDialogsProps) {
  return (
    <>
      <Dialog open={naming !== null} onOpenChange={onNamingOpenChange}>
        <DialogContent className={styles.namingDialog}>
          <DialogHeader className={styles.namingHeader}>
            <DialogTitle className={styles.namingTitle}>
              {naming === 'create'
                ? '新建项目'
                : naming === 'rename-group'
                  ? '重命名分组'
                  : '保存为项目'}
            </DialogTitle>
            <DialogDescription className={styles.namingDescription}>
              {naming === 'rename-group'
                ? '名称和颜色只影响当前工作区标签布局。'
                : '给研究起一个名字，方便之后继续。'}
            </DialogDescription>
          </DialogHeader>
          <form
            className={styles.namingForm}
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmitNaming();
            }}
          >
            <Input
              aria-label={
                naming === 'rename-group' ? '分组名称' : '项目名称'
              }
              placeholder={
                naming === 'rename-group'
                  ? '输入分组名称'
                  : '例如：大豆多环境试验'
              }
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              autoFocus
              maxLength={120}
            />
            <DialogFooter className={styles.namingActions}>
              <Button type="button" variant="ghost" onClick={onCancelNaming}>
                取消
              </Button>
              <Button type="submit" disabled={!name.trim()}>
                确定
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={closingTab !== null} onOpenChange={onCloseDialog}>
        <AlertDialogContent className={styles.saveSessionDialog}>
          <AlertDialogHeader className={styles.saveSessionDialogHeader}>
            <span className={styles.saveSessionDialogEyebrow}>
              未保存的临时会话
            </span>
            <AlertDialogTitle className={styles.saveSessionDialogTitle}>
              保存临时会话？
            </AlertDialogTitle>
            <AlertDialogDescription className={styles.saveSessionDialogDescription}>
              这次会话还没有保存为项目。保存后可以在项目列表中继续研究。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={styles.saveSessionDialogFooter}>
            <AlertDialogCancel className={styles.saveSessionDialogCancel}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              className={styles.saveSessionDialogSecondary}
              onClick={onDiscardClose}
            >
              不保存，关闭
            </AlertDialogAction>
            <Button
              className={styles.saveSessionDialogPrimary}
              onClick={onSaveAndClose}
            >
              保存并关闭
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
