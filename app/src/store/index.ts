/*
 * 应用级 Redux Store:目前仅承载模型提供商配置,并做 localStorage 持久化。
 * 持久化范围与 registry 同步:自定义端点与当前模型变化时更新运行时目录。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import type { TypedUseSelectorHook } from "react-redux";
import providersReducer, {
  providersSlice,
} from "../features/providers/store/providersSlice";
import type {
  CustomProviderConfig,
  CustomYoloModelConfig,
  ModelSelection,
} from "../features/providers/types";
import {
  applyCustomProviders,
  getModels,
  isValidProviderId,
  isValidCustomProviderUrl,
} from "../features/providers/services/registry";
import { migrateLegacyProviderKeys } from "../features/providers/services/credentials";

const PROVIDERS_STORAGE_KEY = "pod-agent.providers:v2";
const LEGACY_PROVIDERS_STORAGE_KEY = "pod-agent.providers";

type PersistedProviders = {
  customProviders: CustomProviderConfig[];
  customYoloModels: CustomYoloModelConfig[];
  currentModel: ModelSelection | null;
};

function emptyPersistedProviders(): PersistedProviders {
  return { customProviders: [], customYoloModels: [], currentModel: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCustomProviderConfig(value: unknown): value is CustomProviderConfig {
  if (!isRecord(value)) return false;
  const modelIds = value.modelIds;
  return (
    typeof value.id === "string" &&
    value.id.startsWith("custom-") &&
    isValidProviderId(value.id) &&
    typeof value.name === "string" &&
    Boolean(value.name.trim()) &&
    typeof value.baseUrl === "string" &&
    isValidCustomProviderUrl(value.baseUrl) &&
    (modelIds === undefined ||
      (Array.isArray(modelIds) && modelIds.every((id) => typeof id === "string"))) &&
    (value.modelId === undefined || typeof value.modelId === "string")
  );
}

function isCustomYoloModelConfig(value: unknown): value is CustomYoloModelConfig {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    Boolean(value.id.trim()) &&
    typeof value.name === "string" &&
    Boolean(value.name.trim()) &&
    typeof value.weightsPath === "string" &&
    Boolean(value.weightsPath.trim())
  );
}

function isModelSelection(value: unknown): value is ModelSelection {
  return (
    isRecord(value) &&
    typeof value.providerId === "string" &&
    isValidProviderId(value.providerId) &&
    typeof value.modelId === "string" &&
    Boolean(value.modelId.trim())
  );
}

function loadPersistedProviders(): PersistedProviders {
  try {
    const raw =
      window.localStorage.getItem(PROVIDERS_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_PROVIDERS_STORAGE_KEY);
    if (!raw) {
      return emptyPersistedProviders();
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return emptyPersistedProviders();
    return {
      customProviders: Array.isArray(parsed.customProviders)
        ? parsed.customProviders.filter(isCustomProviderConfig)
        : [],
      customYoloModels: Array.isArray(parsed.customYoloModels)
        ? parsed.customYoloModels.filter(isCustomYoloModelConfig)
        : [],
      currentModel: isModelSelection(parsed.currentModel)
        ? parsed.currentModel
        : null,
    };
  } catch {
    return emptyPersistedProviders();
  }
}

function persistProviders(value: PersistedProviders): void {
  try {
    window.localStorage.setItem(PROVIDERS_STORAGE_KEY, JSON.stringify(value));
    window.localStorage.removeItem(LEGACY_PROVIDERS_STORAGE_KEY);
  } catch {
    // 配置写盘失败不应打断当前会话；下次启动仍可使用当前内存状态。
  }
}

export const store = configureStore({
  reducer: {
    providers: providersReducer,
  },
});

// 启动时恢复持久化配置并预热注册表(内置提供商目录同步就绪)
const persisted = loadPersistedProviders();
store.dispatch(providersSlice.actions.setCustomProviders(persisted.customProviders));
store.dispatch(providersSlice.actions.setCustomYoloModels(persisted.customYoloModels));
store.dispatch(providersSlice.actions.setCurrentModel(persisted.currentModel));
applyCustomProviders(persisted.customProviders);
getModels();
// 启动即写入净化后的 v2 配置，清除旧配置中可能存在的敏感 URL 或非法字段。
persistProviders(persisted);
void migrateLegacyProviderKeys();

let persistTimer: number | undefined;
store.subscribe(() => {
  const { customProviders, customYoloModels, currentModel } = store.getState().providers;
  // 自定义端点变化需同步进运行时注册表;签名去重由 registry 内部保证
  applyCustomProviders(customProviders);
  // 密集 dispatch 下合并写盘,避免每个流式 delta 都触发持久化
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistProviders({ customProviders, customYoloModels, currentModel });
  }, 200);
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
