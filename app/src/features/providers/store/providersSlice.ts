/*
 * 模型提供商状态:自定义端点配置与当前模型选择,均为可序列化数据。
 * 运行时 Model 对象与密钥不进 Redux,使用时经 registry/credentialStore 解析。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  CustomProviderConfig,
  ModelSelection,
} from "../types";

type ProvidersState = {
  customProviders: CustomProviderConfig[];
  currentModel: ModelSelection | null;
};

const initialState: ProvidersState = {
  customProviders: [],
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
  removeCustomProvider,
  setCurrentModel,
} = providersSlice.actions;

export default providersSlice.reducer;
export type { ProvidersState };
