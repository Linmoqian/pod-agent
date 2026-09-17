// 开发人员模式下的 SSH 对象列表。
// Created on 2026-09-17
// @author: https://github.com/Linmoqian

import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import SshObjectList from './SshObjectList';
import SshObjectDialog from './SshObjectDialog';
import type { SshObject } from './sshTypes';
import { getSshObjectLabel } from './sshUtils';
import styles from './TerminalPanel.module.css';

function createSshObject(sequence: number): SshObject {
  return {
    id: `ssh-${sequence}`,
    name: `SSH 对象 ${sequence}`,
    host: '',
    port: '22',
    username: '',
    authMethod: 'key',
    keyPath: '~/.ssh/id_ed25519',
    password: '',
  };
}

export default function SshPanel({ hidden = false }: { hidden?: boolean }) {
  const nextObjectSequence = useRef(2);
  const [objects, setObjects] = useState<SshObject[]>(() => [
    createSshObject(1),
  ]);
  const [dialog, setDialog] = useState<{
    mode: 'create' | 'edit';
    object: SshObject;
  } | null>(null);

  useEffect(() => {
    if (hidden) setDialog(null);
  }, [hidden]);

  const openCreateDialog = () => {
    const sequence = nextObjectSequence.current;
    nextObjectSequence.current += 1;
    setDialog({ mode: 'create', object: createSshObject(sequence) });
  };

  const openEditDialog = (object: SshObject) => {
    setDialog({ mode: 'edit', object: { ...object } });
  };

  const saveObject = (nextObject: SshObject) => {
    setObjects((current) => {
      if (dialog?.mode === 'create') return [...current, nextObject];
      return current.map((object) =>
        object.id === nextObject.id ? nextObject : object,
      );
    });
  };

  const deleteObject = (object: SshObject) => {
    const index = objects.findIndex((item) => item.id === object.id);
    if (index < 0) return;

    setObjects((current) => current.filter((item) => item.id !== object.id));
    setDialog(null);

    toast(`已删除 ${getSshObjectLabel(object)}`, {
      duration: 5000,
      action: {
        label: '撤销',
        onClick: () => {
          setObjects((current) => {
            if (current.some((item) => item.id === object.id)) return current;
            const restored = [...current];
            restored.splice(Math.min(index, restored.length), 0, object);
            return restored;
          });
        },
      },
    });
  };

  const handleSave = (nextObject: SshObject) => {
    saveObject(nextObject);
    setDialog(null);
  };

  const notifyUnavailable = (action: '连接' | '测试连接') => {
    toast(`SSH 后端尚未接入，暂不能${action}`);
  };

  return (
    <section
      className={styles.sshPanel}
      aria-label="SSH"
      aria-hidden={hidden}
      hidden={hidden}
    >
      <section className={styles.sshObjects} aria-label="SSH 连接列表">
        <div className={styles.sshObjectsHeader}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={styles.sshNewObject}
            aria-label="新建对象"
            title="新建对象"
            onClick={openCreateDialog}
          >
            <Plus size={16} aria-hidden />
          </Button>
        </div>

        <SshObjectList
          objects={objects}
          onSelect={openEditDialog}
          onConnect={() => notifyUnavailable('连接')}
          onPing={() => notifyUnavailable('测试连接')}
          onDelete={deleteObject}
          onReorder={setObjects}
        />
      </section>

      <SshObjectDialog
        mode={dialog?.mode ?? 'edit'}
        object={dialog?.object ?? null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        onSave={handleSave}
        onDelete={deleteObject}
      />
    </section>
  );
}
