// SSH 连接列表中的单个对象行。
// Created on 2026-09-17
// @author: https://github.com/Linmoqian

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plug, Radio, Server, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { SshObject } from './sshTypes';
import {
  getSshObjectEndpoint,
  getSshObjectLabel,
  isSshObjectConfigured,
} from './sshUtils';
import styles from './TerminalPanel.module.css';

export type SshObjectRowProps = {
  object: SshObject;
  onSelect?: (object: SshObject) => void;
  onConnect?: (object: SshObject) => void;
  onPing?: (object: SshObject) => void;
  onDelete?: (object: SshObject) => void;
  sortable?: ReturnType<typeof useSortable>;
  dragging?: boolean;
  overlay?: boolean;
};

function SshObjectActions({
  object,
  onConnect,
  onPing,
  onDelete,
}: Pick<SshObjectRowProps, 'object' | 'onConnect' | 'onPing' | 'onDelete'>) {
  const label = getSshObjectLabel(object);
  const configured = isSshObjectConfigured(object);

  return (
    <div className={styles.sshObjectActions}>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className={styles.sshObjectAction}
        aria-label={`连接${label}`}
        title="连接"
        disabled={!configured}
        onClick={(event) => {
          event.stopPropagation();
          onConnect?.(object);
        }}
      >
        <Plug size={14} aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className={styles.sshObjectAction}
        aria-label={`测试连接${label}`}
        title="测试连接（ping）"
        disabled={!configured}
        onClick={(event) => {
          event.stopPropagation();
          onPing?.(object);
        }}
      >
        <Radio size={14} aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className={`${styles.sshObjectAction} ${styles.sshObjectDelete}`}
        aria-label={`删除${label}`}
        title="删除"
        onClick={(event) => {
          event.stopPropagation();
          onDelete?.(object);
        }}
      >
        <Trash2 size={14} aria-hidden />
      </Button>
    </div>
  );
}

export default function SshObjectRow({
  object,
  onSelect,
  onConnect,
  onPing,
  onDelete,
  sortable,
  dragging = false,
  overlay = false,
}: SshObjectRowProps) {
  const label = getSshObjectLabel(object);
  const configured = isSshObjectConfigured(object);
  const style = sortable
    ? {
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }
    : undefined;

  return (
    <div
      ref={sortable?.setNodeRef}
      className={styles.sshObject}
      data-dragging={dragging ? 'true' : undefined}
      data-overlay={overlay ? 'true' : undefined}
      role="listitem"
      style={style}
    >
      <button
        type="button"
        className={styles.sshObjectHandle}
        aria-label={`移动${label}`}
        title="拖动排序"
        disabled={overlay}
        {...sortable?.attributes}
        {...sortable?.listeners}
      >
        <GripVertical size={15} aria-hidden />
      </button>
      <button
        type="button"
        className={styles.sshObjectMain}
        aria-label={`${label}，打开配置`}
        disabled={overlay}
        onClick={() => onSelect?.(object)}
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
      {!overlay && (
        <SshObjectActions
          object={object}
          onConnect={onConnect}
          onPing={onPing}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
