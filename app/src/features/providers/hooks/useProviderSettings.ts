/*
 * 提供商设置面板数据流:聚合注册表、密钥预览与自定义端点操作。
 * 组件只做展示与交互,pi-ai 对象操作全部收敛在此 hook 与 services 层。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../../store";
import {
  addCustomProvider,
  removeCustomProvider,
  setCurrentModel,
} from "../store/providersSlice";
import type { ModelSelection } from "../types";
import {
  CUSTOM_PROVIDER_PREFIX,
  generateCustomProviderId,
  getModels,
} from "../services/registry";
import {
  clearProviderKey,
  getKeyPreview,
  saveProviderKey,
} from "../services/credentials";

/** 面板展示的提供商行数据 */
export type ProviderRow = {
  id: string;
  name: string;
  baseUrl?: string;
  keyPreview: string | null;
  custom: boolean;
};

export type ModelOptionGroup = {
  providerId: string;
  providerName: string;
  options: Array<{ label: string; value: string }>;
};

/** 从注册表收集提供商行,附带密钥尾缀预览 */
async function collectProviderRows(): Promise<ProviderRow[]> {
  const providers = getModels().getProviders();
  const previews = new Map(
    await Promise.all(
      providers.map(async (provider) => {
        const preview = await getKeyPreview(provider.id);
        return [provider.id, preview] as const;
      }),
    ),
  );
  return providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    keyPreview: previews.get(provider.id) ?? null,
    custom: provider.id.startsWith(CUSTOM_PROVIDER_PREFIX),
  }));
}

/** 按提供商分组模型目录;行名缺失时退回 providerId */
function buildModelGroups(
  rows: ProviderRow[],
): ModelOptionGroup[] {
  const nameById = new Map(rows.map((row) => [row.id, row.name]));
  const groups = new Map<string, ModelOptionGroup>();
  for (const model of getModels().getModels()) {
    const group =
      groups.get(model.provider) ??
      {
        providerId: model.provider,
        providerName: nameById.get(model.provider) ?? model.provider,
        options: [],
      };
    group.options.push({
      label: model.name,
      // providerId 不含 "/",首个斜杠即分隔符;模型 ID 含斜杠也不受影响
      value: `${model.provider}/${model.id}`,
    });
    groups.set(model.provider, group);
  }
  return [...groups.values()].sort((a, b) =>
    a.providerName.localeCompare(b.providerName),
  );
}

export function useProviderSettings() {
  const dispatch = useAppDispatch();
  const { customProviders, currentModel } = useAppSelector(
    (state) => state.providers,
  );

  const [rows, setRows] = useState<ProviderRow[]>([]);
  // 自定义端点刷新模型后自增,驱动模型选项重算
  const [catalogTick, setCatalogTick] = useState(0);

  useEffect(() => {
    void collectProviderRows().then(setRows);
  }, [customProviders]);

  const saveKey = useCallback(
    async (providerId: string, key: string) => {
      await saveProviderKey(providerId, key);
      setRows(await collectProviderRows());
    },
    [],
  );

  const clearKey = useCallback(async (providerId: string) => {
    await clearProviderKey(providerId);
    setRows(await collectProviderRows());
  }, []);

  const addCustom = useCallback(
    (name: string, baseUrl: string) => {
      dispatch(
        addCustomProvider({
          id: generateCustomProviderId(),
          name,
          // 统一去掉尾部斜杠,便于 registry 拼 /models
          baseUrl: baseUrl.replace(/\/+$/, ""),
        }),
      );
    },
    [dispatch],
  );

  const removeCustom = useCallback(
    (providerId: string) => {
      dispatch(removeCustomProvider(providerId));
      void clearProviderKey(providerId);
    },
    [dispatch],
  );

  /** 刷新自定义端点的动态模型目录;成功返回 null,失败返回错误文案 */
  const refreshCustomModels = useCallback(
    async (providerId: string): Promise<string | null> => {
      const result = await getModels().refresh({ providers: [providerId] });
      const error = result.errors.get(providerId);
      if (error) return error.message;
      setCatalogTick((tick) => tick + 1);
      return null;
    },
    [],
  );

  const modelGroups = useMemo<ModelOptionGroup[]>(
    () => buildModelGroups(rows),
    // catalogTick:自定义端点刷新后强制重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, catalogTick],
  );

  const selectModel = useCallback(
    (selection: ModelSelection | null) => {
      dispatch(setCurrentModel(selection));
    },
    [dispatch],
  );

  return {
    rows,
    currentModel,
    modelGroups,
    saveKey,
    clearKey,
    addCustom,
    removeCustom,
    refreshCustomModels,
    selectModel,
  };
}

export default useProviderSettings;
