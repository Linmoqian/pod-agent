/*
 * localStorage 版 CredentialStore:在 WebView 本地磁盘持久化各提供商 API Key。
 * 形状对齐 pi-ai 的 auth.json 语义,每个提供商至多一条凭证;
 * modify 按 pi-ai 契约做按提供商串行化的读-改-写。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import type {
  Credential,
  CredentialInfo,
  CredentialStore,
} from "@earendil-works/pi-ai";

const STORAGE_KEY = "pod-agent.credentials";

type CredentialMap = Record<string, Credential>;

function loadAll(): CredentialMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as CredentialMap)
      : {};
  } catch {
    // 损坏数据按空处理,避免阻塞启动;下次写入时自然修复
    return {};
  }
}

function saveAll(credentials: CredentialMap): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
}

export function localStorageCredentialStore(): CredentialStore {
  // 同一提供商的写操作串行化,避免并发覆盖;浏览器单进程内队列即可
  const chains = new Map<string, Promise<unknown>>();

  function enqueue<T>(providerId: string, task: () => Promise<T>): Promise<T> {
    const previous = chains.get(providerId) ?? Promise.resolve();
    const current = previous.then(task, task);
    chains.set(providerId, current);
    return current;
  }

  return {
    read: (providerId) => enqueue(providerId, async () => loadAll()[providerId]),
    list: async (): Promise<readonly CredentialInfo[]> =>
      Object.entries(loadAll()).map(([providerId, credential]) => ({
        providerId,
        type: credential.type,
      })),
    modify: (providerId, fn) =>
      enqueue(providerId, async () => {
        const all = loadAll();
        const next = await fn(all[providerId]);
        if (next !== undefined) {
          all[providerId] = next;
          saveAll(all);
        }
        return next;
      }),
    delete: (providerId) =>
      enqueue(providerId, async () => {
        const all = loadAll();
        delete all[providerId];
        saveAll(all);
      }),
  };
}

/** 应用共享的凭证存储单例,registry 与设置面板共用同一份数据 */
export const credentialStore = localStorageCredentialStore();

/** 保存某提供商的 API Key(空串视为清除) */
export async function saveProviderKey(
  providerId: string,
  key: string,
): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await credentialStore.delete(providerId);
    return;
  }
  await credentialStore.modify(providerId, async () => ({
    type: "api_key" as const,
    key: trimmed,
  }));
}

/** 清除某提供商凭证 */
export function clearProviderKey(providerId: string): Promise<void> {
  return credentialStore.delete(providerId);
}

/** 读取密钥尾 4 位用于界面确认展示;未配置返回 null */
export async function getKeyPreview(
  providerId: string,
): Promise<string | null> {
  const credential = await credentialStore.read(providerId);
  const key = credential?.type === "api_key" ? credential.key : undefined;
  if (!key) return null;
  return `••••${key.slice(-4)}`;
}
