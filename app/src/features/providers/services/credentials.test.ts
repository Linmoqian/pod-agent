/*
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

import {
  clearProviderKey,
  getKeyPreview,
  saveProviderKey,
} from './credentials';

describe('Keychain 凭据客户端', () => {
  const keychain = new Map<string, string>();

  beforeEach(() => {
    keychain.clear();
    invokeMock.mockReset();
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    });
    invokeMock.mockImplementation(async (command: string, args?: unknown) => {
      const payload = (args ?? {}) as { providerId?: string; key?: string };
      if (command === 'set_provider_key' && payload.providerId && payload.key) {
        keychain.set(payload.providerId, payload.key);
        return undefined;
      }
      if (command === 'clear_provider_key' && payload.providerId) {
        keychain.delete(payload.providerId);
        return undefined;
      }
      if (command === 'get_provider_key_preview' && payload.providerId) {
        const key = keychain.get(payload.providerId);
        return key ? `••••${key.slice(-4)}` : null;
      }
      throw new Error(`unexpected command: ${command}`);
    });
  });

  it('保存只调用 Rust，并只返回密钥尾部预览', async () => {
    await saveProviderKey('anthropic', ' sk-ant-1234 ');
    expect(keychain.get('anthropic')).toBe('sk-ant-1234');
    expect(await getKeyPreview('anthropic')).toBe('••••1234');
    expect(invokeMock).toHaveBeenCalledWith('set_provider_key', {
      providerId: 'anthropic',
      key: 'sk-ant-1234',
    });
  });

  it('清除和保存空串都不会留下本地凭据', async () => {
    await saveProviderKey('deepseek', 'sk-x');
    await saveProviderKey('deepseek', '  ');
    expect(await getKeyPreview('deepseek')).toBeNull();
    await saveProviderKey('openai', 'sk-y');
    await clearProviderKey('openai');
    expect(await getKeyPreview('openai')).toBeNull();
  });
});
