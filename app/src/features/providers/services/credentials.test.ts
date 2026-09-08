/*
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { Credential } from "@earendil-works/pi-ai";
import {
  clearProviderKey,
  getKeyPreview,
  localStorageCredentialStore,
  saveProviderKey,
} from "./credentials";

describe("localStorage 凭证存储", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("保存后可读取,密钥尾缀预览正确", async () => {
    await saveProviderKey("anthropic", "sk-ant-1234");
    const credential = await localStorageCredentialStore().read("anthropic");
    expect(credential).toEqual({ type: "api_key", key: "sk-ant-1234" });
    expect(await getKeyPreview("anthropic")).toBe("••••1234");
  });

  it("list 只暴露元数据,不含密钥本体", async () => {
    await saveProviderKey("openai", "sk-secret");
    const list = await localStorageCredentialStore().list();
    expect(list).toEqual([{ providerId: "openai", type: "api_key" }]);
  });

  it("清除后读取为空,预览返回 null", async () => {
    await saveProviderKey("deepseek", "sk-x");
    await clearProviderKey("deepseek");
    expect(await localStorageCredentialStore().read("deepseek")).toBeUndefined();
    expect(await getKeyPreview("deepseek")).toBeNull();
  });

  it("保存空串等效于清除", async () => {
    await saveProviderKey("google", "g-key");
    await saveProviderKey("google", "  ");
    expect(await localStorageCredentialStore().read("google")).toBeUndefined();
  });

  it("modify 是串行化读-改-写:并发写不丢失", async () => {
    const store = localStorageCredentialStore();
    // fn 使用入参 current,契约禁止在 fn 内重入 store 读取(会死锁)
    const appendA = async (current: Credential | undefined) => {
      const base = current?.type === "api_key" ? (current.key ?? "") : "";
      // 在读与写之间插入延迟,放大竞态窗口
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { type: "api_key" as const, key: `${base}a` };
    };
    await Promise.all([store.modify("p", appendA), store.modify("p", appendA)]);
    const credential = await store.read("p");
    expect(credential?.type === "api_key" && credential.key).toBe("aa");
  });
});
