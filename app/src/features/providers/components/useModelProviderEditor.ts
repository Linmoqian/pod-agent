/* 模型供应商详情表单状态与保存动作。
 * Created on 2026-09-17
 * @author: https://github.com/Linmoqian
 */

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { errorText } from '../../../services/errors';
import type { CustomProviderDraft, ProviderRow } from '../hooks/useProviderSettings';
import type { CustomProviderConfig } from '../types';
import type { ModelEditorMode } from './ModelProviderEditor';

function modelIdsFor(config?: CustomProviderConfig): string[] {
  return config?.modelIds ?? (config?.modelId ? [config.modelId] : []);
}

function parseModelIds(value: string): string[] {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}

type UseModelProviderEditorProps = {
  mode: ModelEditorMode;
  provider?: ProviderRow;
  config?: CustomProviderConfig;
  onBack: () => void;
  onSaveCustom: (draft: CustomProviderDraft) => Promise<unknown>;
  onSaveKey: (providerId: string, key: string) => Promise<void>;
  onClearKey: (providerId: string) => Promise<void>;
  onSaveYolo: (name: string, weightsPath: string) => void;
};

export default function useModelProviderEditor({
  mode,
  provider,
  config,
  onBack,
  onSaveCustom,
  onSaveKey,
  onClearKey,
  onSaveYolo,
}: UseModelProviderEditorProps) {
  const isYolo = mode === 'yolo';
  const isBuiltin = mode === 'builtin-provider';
  const [name, setName] = useState(isYolo ? '' : provider?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '');
  const [modelIds, setModelIds] = useState(modelIdsFor(config).join(', '));
  const [weightsPath, setWeightsPath] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(Boolean(provider?.keyPreview));
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (isYolo) {
      if (!name.trim() || !weightsPath.trim()) {
        toast.warning('请填写模型名称与权重地址');
        return;
      }
      onSaveYolo(name.trim(), weightsPath.trim());
      toast.success('图片识别模型已添加');
      onBack();
      return;
    }
    if (isBuiltin) {
      if (!apiKey.trim()) {
        onBack();
        return;
      }
      setSaving(true);
      try {
        await onSaveKey(provider?.id ?? '', apiKey);
        toast.success('API Key 已保存');
        onBack();
      } catch (error) {
        toast.error(errorText(error));
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!name.trim() || !baseUrl.trim()) {
      toast.warning('请填写供应商名称与 Base URL');
      return;
    }
    setSaving(true);
    try {
      await onSaveCustom({
        id: provider?.id,
        name,
        baseUrl,
        modelIds: parseModelIds(modelIds),
        apiKey,
      });
      toast.success(mode === 'new-provider' ? '供应商已添加' : '供应商配置已保存');
      onBack();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async () => {
    if (!provider) return;
    try {
      await onClearKey(provider.id);
      setHasKey(false);
      toast.success('API Key 已清除');
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return {
    isYolo,
    isBuiltin,
    name,
    setName,
    baseUrl,
    setBaseUrl,
    modelIds,
    setModelIds,
    weightsPath,
    setWeightsPath,
    apiKey,
    setApiKey,
    hasKey,
    saving,
    submit,
    clearKey,
  };
}
