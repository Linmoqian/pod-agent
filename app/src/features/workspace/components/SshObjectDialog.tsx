// 开发人员模式下的 SSH 对象配置弹窗。
// Created on 2026-09-17
// @author: https://github.com/Linmoqian

import { Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import SshObjectForm from './SshObjectForm';
import type { SshObject, SshObjectField } from './sshTypes';
import styles from './TerminalPanel.module.css';

type SshObjectDialogMode = 'create' | 'edit';

type SshObjectDialogProps = {
  mode: SshObjectDialogMode;
  object: SshObject | null;
  onOpenChange: (open: boolean) => void;
  onSave: (object: SshObject) => void;
  onDelete?: (object: SshObject) => void;
};

function getSshObjectLabel(object: SshObject): string {
  return object.name.trim() || '未命名 SSH';
}

export default function SshObjectDialog({
  mode,
  object,
  onOpenChange,
  onSave,
  onDelete,
}: SshObjectDialogProps) {
  const [draft, setDraft] = useState<SshObject | null>(object);
  const [connectionNotice, setConnectionNotice] = useState(false);
  const open = object !== null;

  useEffect(() => {
    setDraft(object);
    setConnectionNotice(false);
  }, [object]);

  const updateDraft = (field: SshObjectField, value: string) => {
    setDraft((current) =>
      current ? { ...current, [field]: value } : current,
    );
    setConnectionNotice(false);
  };

  const canConnect = Boolean(
    draft?.host.trim() && draft.port.trim() && draft.username.trim(),
  );

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;
    onSave(draft);
    onOpenChange(false);
  };

  const handleConnect = () => {
    if (canConnect) setConnectionNotice(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {draft && (
        <DialogContent className={styles.sshDialog}>
          <DialogHeader className={styles.sshDialogHeader}>
            <DialogTitle className={styles.sshDialogTitle}>
              {mode === 'create' ? '新建 SSH 对象' : '配置 SSH 对象'}
            </DialogTitle>
            {mode === 'edit' && onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={styles.sshDeleteObject}
                aria-label={`删除${getSshObjectLabel(draft)}`}
                title="删除 SSH 对象"
                onClick={() => onDelete(draft)}
              >
                <Trash2 size={16} aria-hidden />
              </Button>
            )}
          </DialogHeader>

          <SshObjectForm
            draft={draft}
            canConnect={canConnect}
            connectionNotice={connectionNotice}
            onChange={updateDraft}
            onConnect={handleConnect}
            onCancel={() => onOpenChange(false)}
            onSave={handleSave}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}
