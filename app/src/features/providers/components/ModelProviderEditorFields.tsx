/* 模型供应商详情表单字段。
 * Created on 2026-09-17
 * @author: https://github.com/Linmoqian
 */

import { CheckCircle2, KeyRound } from 'lucide-react';

import styles from './ModelProviderSettings.module.css';

type ModelProviderEditorFieldsProps = {
  isYolo: boolean;
  isBuiltin: boolean;
  name: string;
  setName: (value: string) => void;
  baseUrl: string;
  setBaseUrl: (value: string) => void;
  modelIds: string;
  setModelIds: (value: string) => void;
  weightsPath: string;
  setWeightsPath: (value: string) => void;
  apiKey: string;
  setApiKey: (value: string) => void;
  hasKey: boolean;
  clearKey: () => void;
};

export default function ModelProviderEditorFields({
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
  clearKey,
}: ModelProviderEditorFieldsProps) {
  return (
    <div className={styles.editorFields}>
      <label className={styles.field} data-full="true">
        <span>{isYolo || isBuiltin ? '模型名称' : '供应商名称'}</span>
        <input
          value={name}
          disabled={isBuiltin}
          placeholder={isYolo ? '例如 豆荚检测' : '例如 本地 Ollama'}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </label>
      {isYolo ? (
        <label className={styles.field} data-full="true">
          <span>权重地址</span>
          <input
            value={weightsPath}
            placeholder="例如 /models/pod-detector.onnx"
            onChange={(event) => setWeightsPath(event.target.value)}
          />
        </label>
      ) : (
        <>
          <label className={styles.field} data-full="true">
            <span>Base URL</span>
            <input
              value={baseUrl}
              disabled={isBuiltin}
              placeholder="https://api.example.com/v1"
              onChange={(event) => setBaseUrl(event.target.value)}
            />
            <small>{isBuiltin ? '内置提供商地址不可修改' : 'OpenAI 兼容接口的根地址'}</small>
          </label>
          <label className={styles.field}>
            <span>接口格式</span>
            <select value="openai-completions" disabled>
              <option value="openai-completions">OpenAI Chat Completions</option>
            </select>
          </label>
          {!isBuiltin && (
            <label className={styles.field}>
              <span>模型 ID</span>
              <input
                value={modelIds}
                placeholder="例如 qwen3:8b，可用逗号分隔"
                onChange={(event) => setModelIds(event.target.value)}
              />
            </label>
          )}
          <div className={styles.keyField} data-full="true">
            <span>API Key</span>
            <div className={styles.keyRow}>
              <input
                type="password"
                value={apiKey}
                placeholder={hasKey ? '已配置，留空保持不变' : '输入 API Key'}
                onChange={(event) => setApiKey(event.target.value)}
              />
              {hasKey && (
                <span className={styles.keyState}>
                  <CheckCircle2 size={13} />
                  已配置
                </span>
              )}
              {hasKey && (
                <button type="button" className={styles.secondaryButton} onClick={clearKey}>
                  清除
                </button>
              )}
            </div>
            <span className={styles.keyHint}>
              <KeyRound size={12} aria-hidden /> 密钥只保存在桌面端安全存储中
            </span>
          </div>
        </>
      )}
    </div>
  );
}
