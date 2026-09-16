// 开发人员模式下的 SSH 连接配置界面。
// Created on 2026-09-16
// @author: https://github.com/Linmoqian

import { KeyRound, Server, ShieldCheck, WifiOff } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';

import styles from './TerminalPanel.module.css';

type SshAuthMethod = 'key' | 'password';
type SshConnectionState = 'idle' | 'unavailable';

type SshConfig = {
  host: string;
  port: string;
  username: string;
  authMethod: SshAuthMethod;
  keyPath: string;
  password: string;
};

const EMPTY_CONFIG: SshConfig = {
  host: '',
  port: '22',
  username: '',
  authMethod: 'key',
  keyPath: '~/.ssh/id_ed25519',
  password: '',
};

export default function SshPanel() {
  const [config, setConfig] = useState<SshConfig>(EMPTY_CONFIG);
  const [connectionState, setConnectionState] =
    useState<SshConnectionState>('idle');
  const canConnect = Boolean(
    config.host.trim() && config.port.trim() && config.username.trim(),
  );

  const updateConfig = (field: keyof SshConfig, value: string) => {
    setConfig((current) => ({ ...current, [field]: value }));
    setConnectionState('idle');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canConnect) return;
    setConnectionState('unavailable');
  };

  return (
    <section className={styles.sshPanel} aria-labelledby="ssh-panel-title">
      <div className={styles.sshIntro}>
        <span className={styles.sshIntroIcon} aria-hidden>
          <Server size={20} />
        </span>
        <div>
          <h3 id="ssh-panel-title">SSH 远程连接</h3>
          <p>在开发人员模式下配置远程主机，连接后可打开独立的远程终端。</p>
        </div>
      </div>

      <form className={styles.sshForm} onSubmit={handleSubmit}>
        <div className={styles.sshFields}>
          <label>
            <span>主机地址</span>
            <input
              aria-label="SSH 主机地址"
              autoComplete="off"
              value={config.host}
              onChange={(event) => updateConfig('host', event.target.value)}
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
              value={config.port}
              onChange={(event) => updateConfig('port', event.target.value)}
              placeholder="22"
            />
          </label>
          <label>
            <span>用户名</span>
            <input
              aria-label="SSH 用户名"
              autoComplete="username"
              value={config.username}
              onChange={(event) => updateConfig('username', event.target.value)}
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
              data-selected={config.authMethod === 'key'}
              aria-pressed={config.authMethod === 'key'}
              onClick={() => updateConfig('authMethod', 'key')}
            >
              <KeyRound size={15} aria-hidden />
              私钥
            </button>
            <button
              type="button"
              className={styles.sshAuthOption}
              data-selected={config.authMethod === 'password'}
              aria-pressed={config.authMethod === 'password'}
              onClick={() => updateConfig('authMethod', 'password')}
            >
              密码
            </button>
          </div>
          {config.authMethod === 'key' ? (
            <label>
              <span>私钥路径</span>
              <input
                aria-label="SSH 私钥路径"
                autoComplete="off"
                value={config.keyPath}
                onChange={(event) =>
                  updateConfig('keyPath', event.target.value)
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
                value={config.password}
                onChange={(event) =>
                  updateConfig('password', event.target.value)
                }
                placeholder="仅保存在当前页面内存"
              />
            </label>
          )}
        </fieldset>

        <div className={styles.sshFooter}>
          <div
            className={styles.sshStatus}
            data-status={connectionState}
            role="status"
            aria-live="polite"
          >
            {connectionState === 'unavailable' ? (
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

      <div className={styles.sshNotice}>
        <ShieldCheck size={15} aria-hidden />
        当前版本仅提供 SSH 配置界面；不会保存凭据、写入日志或执行远程命令。
      </div>
    </section>
  );
}
