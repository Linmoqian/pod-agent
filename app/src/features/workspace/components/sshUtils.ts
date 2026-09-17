// SSH 对象展示与配置状态辅助函数。
// Created on 2026-09-17
// @author: https://github.com/Linmoqian

import type { SshObject } from './sshTypes';

export function getSshObjectLabel(object: SshObject): string {
  return object.name.trim() || '未命名 SSH';
}

export function getSshObjectEndpoint(object: SshObject): string {
  if (!object.host.trim()) return '待配置';
  return `${object.host.trim()}:${object.port.trim() || '22'}`;
}

export function isSshObjectConfigured(object: SshObject): boolean {
  return Boolean(
    object.host.trim() && object.port.trim() && object.username.trim(),
  );
}
