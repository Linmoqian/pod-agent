/*
 * macOS Keychain 凭据客户端：WebView 只保存非敏感配置，不持有 API Key。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import { invoke } from '@tauri-apps/api/core';

const LEGACY_STORAGE_KEY = 'pod-agent.credentials';

type LegacyCredential = {
  type: 'api_key';
  key: string;
};

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function requireTauriRuntime(): void {
  if (!isTauriRuntime()) {
    throw new Error('KEYCHAIN_TAURI_REQUIRED:请在 Tauri 桌面端配置 API Key');
  }
}

function readLegacyCredentials(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, LegacyCredential] => {
          const value = entry[1];
          return (
            typeof value === 'object' &&
            value !== null &&
            (value as LegacyCredential).type === 'api_key' &&
            typeof (value as LegacyCredential).key === 'string' &&
            Boolean((value as LegacyCredential).key.trim())
          );
        })
        .map(([providerId, credential]) => [providerId, credential.key.trim()]),
    );
  } catch {
    return {};
  }
}

/** 保存密钥；完整值只在输入、Rust Keychain 和 Agent 内存之间短暂流转。 */
export async function saveProviderKey(
  providerId: string,
  key: string,
): Promise<void> {
  requireTauriRuntime();
  const trimmed = key.trim();
  if (!trimmed) {
    await clearProviderKey(providerId);
    return;
  }
  await invoke<void>('set_provider_key', { providerId, key: trimmed });
}

/** 清除 Keychain 中的提供商凭证。 */
export function clearProviderKey(providerId: string): Promise<void> {
  requireTauriRuntime();
  return invoke<void>('clear_provider_key', { providerId });
}

/** 只读取 Keychain 返回的尾部预览，不读取密钥本体。 */
export async function getKeyPreview(
  providerId: string,
): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  return invoke<string | null>('get_provider_key_preview', { providerId });
}

let migrationPromise: Promise<boolean> | null = null;

/** 首次启动迁移旧 localStorage 凭据；失败时保留旧值，成功后才清除。 */
export function migrateLegacyProviderKeys(): Promise<boolean> {
  if (migrationPromise) return migrationPromise;
  if (!isTauriRuntime()) return Promise.resolve(true);

  const credentials = readLegacyCredentials();
  if (!Object.keys(credentials).length) return Promise.resolve(true);

  migrationPromise = invoke<void>('migrate_provider_keys', { credentials })
    .then(() => {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return true;
    })
    .catch(() => {
      // 不删除旧值；调用方可以给出可见提示，用户仍可重试迁移。
      migrationPromise = null;
      return false;
    });
  return migrationPromise;
}
