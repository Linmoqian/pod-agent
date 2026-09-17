// SSH 对象弹窗中的草稿表单。
// Created on 2026-09-17
// @author: https://github.com/Linmoqian

import { KeyRound, WifiOff } from 'lucide-react';
import { type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';

import type { SshObject, SshObjectField } from './sshTypes';
import styles from './TerminalPanel.module.css';

type SshObjectFormProps = {
  draft: SshObject;
  canConnect: boolean;
  connectionNotice: boolean;
  onChange: (field: SshObjectField, value: string) => void;
  onConnect: () => void;
  onCancel: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
};

type SshFieldsProps = {
  draft: SshObject;
  onChange: (field: SshObjectField, value: string) => void;
};

function SshConnectionFields({ draft, onChange }: SshFieldsProps) {
  return (
    <div className={styles.sshFields}>
      <label>
        <span>主机地址</span>
        <input
          aria-label="SSH 主机地址"
          autoComplete="off"
          value={draft.host}
          onChange={(event) => onChange('host', event.target.value)}
          placeholder="例如 192.168.1.10"
        />
      </label>
      <label>
        <span>端口</span>
        <input
          aria-label="SSH 端口"
          inputMode="numeric"
          min="1"
          max="65535"
          value={draft.port}
          onChange={(event) => onChange('port', event.target.value)}
          placeholder="22"
        />
      </label>
      <label>
        <span>用户名</span>
        <input
          aria-label="SSH 用户名"
          autoComplete="username"
          value={draft.username}
          onChange={(event) => onChange('username', event.target.value)}
          placeholder="例如 lian"
        />
      </label>
    </div>
  );
}

function SshAuthFields({ draft, onChange }: SshFieldsProps) {
  return (
    <fieldset className={styles.sshAuth}>
      <legend>认证方式</legend>
      <div
        className={styles.sshAuthOptions}
        role="group"
        aria-label="SSH 认证方式"
      >
        <button
          type="button"
          className={styles.sshAuthOption}
          data-selected={draft.authMethod === 'key'}
          aria-pressed={draft.authMethod === 'key'}
          onClick={() => onChange('authMethod', 'key')}
        >
          <KeyRound size={15} aria-hidden />
          私钥
        </button>
        <button
          type="button"
          className={styles.sshAuthOption}
          data-selected={draft.authMethod === 'password'}
          aria-pressed={draft.authMethod === 'password'}
          onClick={() => onChange('authMethod', 'password')}
        >
          密码
        </button>
      </div>
      {draft.authMethod === 'key' ? (
        <label>
          <span>私钥路径</span>
          <input
            aria-label="SSH 私钥路径"
            autoComplete="off"
            value={draft.keyPath}
            onChange={(event) => onChange('keyPath', event.target.value)}
            placeholder="~/.ssh/id_ed25519"
          />
        </label>
      ) : (
        <label>
          <span>登录密码</span>
          <input
            aria-label="SSH 登录密码"
            autoComplete="new-password"
            type="password"
            value={draft.password}
            onChange={(event) => onChange('password', event.target.value)}
            placeholder="仅保存在当前页面内存"
          />
        </label>
      )}
    </fieldset>
  );
}

export default function SshObjectForm({
  draft,
  canConnect,
  connectionNotice,
  onChange,
  onConnect,
  onCancel,
  onSave,
}: SshObjectFormProps) {
  return (
    <form className={styles.sshForm} onSubmit={onSave}>
      <label className={styles.sshObjectName}>
        <span>对象名称</span>
        <input
          aria-label="SSH 对象名称"
          autoComplete="off"
          value={draft.name}
          onChange={(event) => onChange('name', event.target.value)}
          placeholder="例如：实验室 GPU 服务器"
        />
      </label>

      <SshConnectionFields draft={draft} onChange={onChange} />
      <SshAuthFields draft={draft} onChange={onChange} />

      <DialogFooter className={styles.sshDialogFooter}>
        <div
          className={styles.sshDialogStatus}
          data-status={connectionNotice ? 'error' : undefined}
          role="status"
          aria-live="polite"
        >
          {connectionNotice && (
            <>
              <WifiOff size={15} aria-hidden />
              SSH 后端尚未接入
            </>
          )}
        </div>
        <div className={styles.sshDialogActions}>
          <Button
            type="button"
            variant="outline"
            disabled={!canConnect}
            onClick={onConnect}
          >
            连接
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button type="submit">保存</Button>
        </div>
      </DialogFooter>
    </form>
  );
}
