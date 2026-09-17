// 开发人员模式下的 SSH 对象列表。
// Created on 2026-09-17
// @author: https://github.com/Linmoqian

import { Plus, Server } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import SshObjectDialog from './SshObjectDialog';
import type { SshObject } from './sshTypes';
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

function getSshObjectLabel(object: SshObject): string {
  return object.name.trim() || '未命名 SSH';
}

function getSshObjectEndpoint(object: SshObject): string {
  if (!object.host.trim()) return '待配置';
  return `${object.host.trim()}:${object.port.trim() || '22'}`;
}

function isSshObjectConfigured(object: SshObject): boolean {
  return Boolean(
    object.host.trim() && object.port.trim() && object.username.trim(),
  );
}

function SshObjectList({
  objects,
  onSelect,
  onCreate,
}: {
  objects: SshObject[];
  onSelect: (object: SshObject) => void;
  onCreate: () => void;
}) {
  if (!objects.length) {
    return (
      <div className={styles.sshObjectEmpty}>
        <Server size={18} aria-hidden />
        <span>暂无 SSH 对象</span>
        <Button type="button" size="sm" onClick={onCreate}>
          新建对象
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.sshObjectList}>
      {objects.map((object) => {
        const label = getSshObjectLabel(object);
        const configured = isSshObjectConfigured(object);
        return (
          <button
            key={object.id}
            type="button"
            className={styles.sshObject}
            aria-label={`${label}，打开配置`}
            onClick={() => onSelect(object)}
          >
            <span className={styles.sshObjectIcon} aria-hidden>
              <Server size={15} />
            </span>
            <span className={styles.sshObjectInfo}>
              <strong>{label}</strong>
              <small>{getSshObjectEndpoint(object)}</small>
            </span>
            <span
              className={styles.sshObjectStatus}
              data-configured={configured}
              aria-label={configured ? '待连接' : '待配置'}
            >
              {configured ? '待连接' : '待配置'}
            </span>
          </button>
        );
      })}
    </div>
  );
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

  return (
    <section
      className={styles.sshPanel}
      aria-labelledby="ssh-objects-title"
      aria-hidden={hidden}
      hidden={hidden}
    >
      <section className={styles.sshObjects} aria-labelledby="ssh-objects-title">
        <div className={styles.sshObjectsHeader}>
          <div className={styles.sshObjectsTitle}>
            <Server size={17} aria-hidden />
            <h3 id="ssh-objects-title">SSH 对象</h3>
            <span>{objects.length}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={styles.sshNewObject}
            onClick={openCreateDialog}
          >
            <Plus size={15} aria-hidden />
            新建对象
          </Button>
        </div>

        <SshObjectList
          objects={objects}
          onSelect={openEditDialog}
          onCreate={openCreateDialog}
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
