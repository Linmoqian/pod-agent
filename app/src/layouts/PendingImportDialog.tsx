/*
 * 临时会话提升为项目时的命名弹窗。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

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

import styles from './AppLayout.module.css';

type PendingImportDialogProps = {
  open: boolean;
  projectName: string;
  onProjectNameChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export default function PendingImportDialog({
  open,
  projectName,
  onProjectNameChange,
  onCancel,
  onSubmit,
}: PendingImportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent className={styles.namingDialog}>
        <DialogHeader className={styles.namingHeader}>
          <DialogTitle className={styles.namingTitle}>
            保存为项目后导入
          </DialogTitle>
          <DialogDescription className={styles.namingDescription}>
            数据需要归属到一个项目，便于后续继续研究。
          </DialogDescription>
        </DialogHeader>
        <form
          className={styles.namingForm}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <Input
            aria-label="导入项目名称"
            placeholder="例如：大豆多环境试验"
            value={projectName}
            onChange={(event) => onProjectNameChange(event.target.value)}
            autoFocus
            maxLength={120}
          />
          <DialogFooter className={styles.namingActions}>
            <Button type="button" variant="ghost" onClick={onCancel}>
              取消
            </Button>
            <Button type="submit" disabled={!projectName.trim()}>
              确定
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
