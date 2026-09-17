// 开发人员模式下的 SSH 连接配置界面。
// Created on 2026-09-16
// @author: https://github.com/Linmoqian

import {
  KeyRound,
  Plus,
  Server,
  ShieldCheck,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';

import styles from './TerminalPanel.module.css';

type SshAuthMethod = 'key' | 'password';
type SshConnectionState = 'idle' | 'unavailable';

type SshObject = {
  id: string;
  name: string;
  host: string;
  port: string;
  username: string;
  authMethod: SshAuthMethod;
  keyPath: string;
  password: string;
  connectionState: SshConnectionState;
};

type EditableSshField =
  | 'name'
  | 'host'
  | 'port'
  | 'username'
  | 'authMethod'
  | 'keyPath'
  | 'password';

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
    connectionState: 'idle',
  };
}

function getSshObjectLabel(object: SshObject): string {
  return object.name.trim() || '未命名 SSH';
}

function getSshObjectEndpoint(object: SshObject): string {
  if (!object.host.trim()) return '未配置主机';
  return `${object.host.trim()}:${object.port.trim() || '22'}`;
}

export default function SshPanel({ hidden = false }: { hidden?: boolean }) {
  const nextObjectSequence = useRef(2);
  const [objects, setObjects] = useState<SshObject[]>(() => [
    createSshObject(1),
  ]);
  const [activeObjectId, setActiveObjectId] = useState<string | null>('ssh-1');
  const activeObject = objects.find((object) => object.id === activeObjectId);
  const canConnect = Boolean(
    activeObject?.host.trim() &&
      activeObject.port.trim() &&
      activeObject.username.trim(),
  );

  const updateObject = (field: EditableSshField, value: string) => {
    if (!activeObjectId) return;
    setObjects((current) =>
      current.map((object) =>
        object.id === activeObjectId
          ? { ...object, [field]: value, connectionState: 'idle' }
          : object,
      ),
    );
  };

  const createObject = () => {
    const sequence = nextObjectSequence.current;
    nextObjectSequence.current += 1;
    const object = createSshObject(sequence);
    setObjects((current) => [...current, object]);
    setActiveObjectId(object.id);
  };

  const deleteObject = (objectId: string) => {
    const index = objects.findIndex((object) => object.id === objectId);
    if (index < 0) return;
    const nextObjects = objects.filter((object) => object.id !== objectId);
    setObjects(nextObjects);
    if (activeObjectId === objectId) {
      setActiveObjectId(
        nextObjects[index]?.id ??
          nextObjects[index - 1]?.id ??
          nextObjects[0]?.id ??
          null,
      );
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canConnect || !activeObjectId) return;
    setObjects((current) =>
      current.map((object) =>
        object.id === activeObjectId
          ? { ...object, connectionState: 'unavailable' }
          : object,
      ),
    );
  };

  return (
    <section
      className={styles.sshPanel}
      aria-labelledby="ssh-panel-title"
      aria-hidden={hidden}
      hidden={hidden}
    >
      <div className={styles.sshIntro}>
        <span className={styles.sshIntroIcon} aria-hidden>
          <Server size={20} />
        </span>
        <div>
          <h3 id="ssh-panel-title">SSH 远程连接</h3>
          <p>管理多个远程主机，选择对象后配置连接参数。</p>
        </div>
      </div>

      <section className={styles.sshObjects} aria-labelledby="ssh-objects-title">
        <div className={styles.sshObjectsHeader}>
          <div className={styles.sshObjectsTitle}>
            <h3 id="ssh-objects-title">SSH 对象</h3>
            <span>{objects.length}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={styles.sshNewObject}
            onClick={createObject}
          >
            <Plus size={15} aria-hidden />
            新建对象
          </Button>
        </div>
        {objects.length > 0 ? (
          <div className={styles.sshObjectList}>
            {objects.map((object) => {
              const label = getSshObjectLabel(object);
              return (
                <button
                  key={object.id}
                  type="button"
                  className={styles.sshObject}
                  data-active={object.id === activeObjectId}
                  aria-pressed={object.id === activeObjectId}
                  aria-label={`${label}，配置`}
                  onClick={() => setActiveObjectId(object.id)}
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
                    data-status={object.connectionState}
                    title={
                      object.connectionState === 'unavailable'
                        ? 'SSH 后端尚未接入'
                        : '未连接'
                    }
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>
        ) : (
          <div className={styles.sshObjectEmpty}>
            <Server size={18} aria-hidden />
            <span>暂无 SSH 对象</span>
            <Button type="button" size="sm" onClick={createObject}>
              新建 SSH 对象
            </Button>
          </div>
        )}
      </section>

      {activeObject ? (
        <>
          <div className={styles.sshEditorHeader}>
            <div>
              <span>当前配置</span>
              <h3>{getSshObjectLabel(activeObject)}</h3>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={styles.sshDeleteObject}
              aria-label={`删除${getSshObjectLabel(activeObject)}`}
              title="删除 SSH 对象"
              onClick={() => deleteObject(activeObject.id)}
            >
              <Trash2 size={16} aria-hidden />
            </Button>
          </div>

          <form className={styles.sshForm} onSubmit={handleSubmit}>
            <label className={styles.sshObjectName}>
              <span>对象名称</span>
              <input
                aria-label="SSH 对象名称"
                autoComplete="off"
                value={activeObject.name}
                onChange={(event) => updateObject('name', event.target.value)}
                placeholder="例如：实验室 GPU 服务器"
              />
            </label>

            <div className={styles.sshFields}>
              <label>
                <span>主机地址</span>
                <input
                  aria-label="SSH 主机地址"
                  autoComplete="off"
                  value={activeObject.host}
                  onChange={(event) => updateObject('host', event.target.value)}
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
                  value={activeObject.port}
                  onChange={(event) => updateObject('port', event.target.value)}
                  placeholder="22"
                />
              </label>
              <label>
                <span>用户名</span>
                <input
                  aria-label="SSH 用户名"
                  autoComplete="username"
                  value={activeObject.username}
                  onChange={(event) =>
                    updateObject('username', event.target.value)
                  }
                  placeholder="例如 lian"
                />
              </label>
            </div>

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
                  data-selected={activeObject.authMethod === 'key'}
                  aria-pressed={activeObject.authMethod === 'key'}
                  onClick={() => updateObject('authMethod', 'key')}
                >
                  <KeyRound size={15} aria-hidden />
                  私钥
                </button>
                <button
                  type="button"
                  className={styles.sshAuthOption}
                  data-selected={activeObject.authMethod === 'password'}
                  aria-pressed={activeObject.authMethod === 'password'}
                  onClick={() => updateObject('authMethod', 'password')}
                >
                  密码
                </button>
              </div>
              {activeObject.authMethod === 'key' ? (
                <label>
                  <span>私钥路径</span>
                  <input
                    aria-label="SSH 私钥路径"
                    autoComplete="off"
                    value={activeObject.keyPath}
                    onChange={(event) =>
                      updateObject('keyPath', event.target.value)
                    }
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
                    value={activeObject.password}
                    onChange={(event) =>
                      updateObject('password', event.target.value)
                    }
                    placeholder="仅保存在当前页面内存"
                  />
                </label>
              )}
            </fieldset>

            <div className={styles.sshFooter}>
              <div
                className={styles.sshStatus}
                data-status={activeObject.connectionState}
                role="status"
                aria-live="polite"
              >
                {activeObject.connectionState === 'unavailable' ? (
                  <>
                    <WifiOff size={15} aria-hidden />
                    SSH 后端尚未接入
                  </>
                ) : (
                  <>
                    <span className={styles.sshStatusDot} aria-hidden />
                    未连接
                  </>
                )}
              </div>
              <Button type="submit" size="sm" disabled={!canConnect}>
                连接
              </Button>
            </div>
          </form>
        </>
      ) : (
        <div className={styles.sshEditorEmpty}>
          选择一个 SSH 对象，或新建对象开始配置。
        </div>
      )}

      <div className={styles.sshNotice}>
        <ShieldCheck size={15} aria-hidden />
        对象配置仅保存在当前页面内存；SSH 后端接入后可按对象连接远程终端。
      </div>
    </section>
  );
}
