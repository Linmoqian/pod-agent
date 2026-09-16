/*
 * 模型提供商状态:自定义端点配置与当前模型选择,均为可序列化数据。
 * 运行时 Model 对象与密钥不进 Redux；密钥仅由 Rust Keychain 注入 Agent。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  CustomProviderConfig,
  CustomYoloModelConfig,
  ModelSelection,
} from "../types";

type ProvidersState = {
  customProviders: CustomProviderConfig[];
  customYoloModels: CustomYoloModelConfig[];
  currentModel: ModelSelection | null;
};

const initialState: ProvidersState = {
  customProviders: [],
  customYoloModels: [],
  currentModel: null,
};

export const providersSlice = createSlice({
  name: "providers",
  initialState,
  reducers: {
    setCustomProviders(
      state,
      action: PayloadAction<CustomProviderConfig[]>,
    ) {
      state.customProviders = action.payload;
    },
    addCustomProvider(
      state,
      action: PayloadAction<CustomProviderConfig>,
    ) {
      state.customProviders.push(action.payload);
    },
    setCustomProviderModels(
      state,
      action: PayloadAction<{ providerId: string; modelIds: string[] }>,
    ) {
      const provider = state.customProviders.find(
        (config) => config.id === action.payload.providerId,
      );
      if (provider) {
        provider.modelIds = action.payload.modelIds;
        delete provider.modelId;
      }
    },
    setCustomYoloModels(
      state,
      action: PayloadAction<CustomYoloModelConfig[]>,
    ) {
      state.customYoloModels = action.payload;
    },
    addCustomYoloModel(
      state,
      action: PayloadAction<CustomYoloModelConfig>,
    ) {
      state.customYoloModels.push(action.payload);
    },
    removeCustomYoloModel(state, action: PayloadAction<string>) {
      state.customYoloModels = state.customYoloModels.filter(
        (config) => config.id !== action.payload,
      );
    },
    removeCustomProvider(state, action: PayloadAction<string>) {
      state.customProviders = state.customProviders.filter(
        (config) => config.id !== action.payload,
      );
      // 被删提供商下的选中模型一并失效
      if (state.currentModel?.providerId === action.payload) {
        state.currentModel = null;
      }
    },
    setCurrentModel(
      state,
      action: PayloadAction<ModelSelection | null>,
    ) {
      state.currentModel = action.payload;
    },
  },
});

export const {
  setCustomProviders,
  addCustomProvider,
  setCustomProviderModels,
  setCustomYoloModels,
  addCustomYoloModel,
  removeCustomYoloModel,
  removeCustomProvider,
  setCurrentModel,
} = providersSlice.actions;

export default providersSlice.reducer;
export type { ProvidersState };
