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
} from "../features/providers/services/registry";
import { migrateLegacyProviderKeys } from "../features/providers/services/credentials";

const PROVIDERS_STORAGE_KEY = "pod-agent.providers";

type PersistedProviders = {
  customProviders: CustomProviderConfig[];
  customYoloModels: CustomYoloModelConfig[];
  currentModel: ModelSelection | null;
};

function loadPersistedProviders(): PersistedProviders {
  try {
    const raw = window.localStorage.getItem(PROVIDERS_STORAGE_KEY);
    if (!raw) {
      return {
        customProviders: [],
        customYoloModels: [],
        currentModel: null,
      };
    }
    const parsed = JSON.parse(raw) as Partial<PersistedProviders>;
    const currentModel = parsed.currentModel;
    return {
      customProviders: Array.isArray(parsed.customProviders)
        ? parsed.customProviders
        : [],
      customYoloModels: Array.isArray(parsed.customYoloModels)
        ? parsed.customYoloModels
        : [],
      currentModel:
        currentModel &&
        typeof currentModel.providerId === "string" &&
        typeof currentModel.modelId === "string"
          ? currentModel
          : null,
    };
  } catch {
    return { customProviders: [], customYoloModels: [], currentModel: null };
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
void migrateLegacyProviderKeys();

let persistTimer: number | undefined;
store.subscribe(() => {
  const { customProviders, customYoloModels, currentModel } = store.getState().providers;
  // 自定义端点变化需同步进运行时注册表;签名去重由 registry 内部保证
  applyCustomProviders(customProviders);
  // 密集 dispatch 下合并写盘,避免每个流式 delta 都触发持久化
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    window.localStorage.setItem(
      PROVIDERS_STORAGE_KEY,
      JSON.stringify({ customProviders, customYoloModels, currentModel }),
    );
  }, 200);
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
