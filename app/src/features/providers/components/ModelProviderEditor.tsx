/* 模型供应商与图片识别模型的详情编辑页。
 * Created on 2026-09-17
 * @author: https://github.com/Linmoqian
 */

import { ArrowLeft, ScanLine, Server, Trash2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { FormEvent } from 'react';

import type { CustomProviderDraft, ProviderRow } from '../hooks/useProviderSettings';
import type { CustomProviderConfig } from '../types';
import ModelProviderEditorFields from './ModelProviderEditorFields';
import styles from './ModelProviderSettings.module.css';
import useModelProviderEditor from './useModelProviderEditor';

export type ModelEditorMode =
  | 'new-provider'
  | 'custom-provider'
  | 'builtin-provider'
  | 'yolo';

export type ModelProviderEditorProps = {
  mode: ModelEditorMode;
  provider?: ProviderRow;
  config?: CustomProviderConfig;
  onBack: () => void;
  onSaveCustom: (draft: CustomProviderDraft) => Promise<unknown>;
  onSaveKey: (providerId: string, key: string) => Promise<void>;
  onClearKey: (providerId: string) => Promise<void>;
  onSaveYolo: (name: string, weightsPath: string) => void;
  onRemove?: () => Promise<void>;
};

export default function ModelProviderEditor({
  mode,
  provider,
  config,
  onBack,
  onSaveCustom,
  onSaveKey,
  onClearKey,
  onSaveYolo,
  onRemove,
}: ModelProviderEditorProps) {
  const reduced = useReducedMotion();
  const form = useModelProviderEditor({
    mode,
    provider,
    config,
    onBack,
    onSaveCustom,
    onSaveKey,
    onClearKey,
    onSaveYolo,
  });
  const title = form.isYolo
    ? '添加图片识别模型'
    : mode === 'new-provider'
      ? '添加新供应商'
      : `配置 ${provider?.name ?? '供应商'}`;

  return (
    <motion.section
      className={styles.panel}
      initial={reduced ? false : { opacity: 0, transform: 'translateY(4px)' }}
      animate={{ opacity: 1, transform: 'translateY(0)' }}
      exit={reduced ? undefined : { opacity: 0, transform: 'translateY(-4px)' }}
      transition={reduced ? { duration: 0 } : { duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
    >
      <header className={styles.editorHeader}>
        <div className={styles.editorHeading}>
          <button type="button" className={styles.backButton} aria-label="返回模型列表" onClick={onBack}>
            <ArrowLeft size={17} />
          </button>
          <div className={styles.editorCopy}>
            <h3 className={styles.title}>{title}</h3>
            <p className={styles.editorDescription}>
              {form.isYolo ? '填写本地权重地址，保存后可在图片识别任务中使用。' : '配置模型访问地址与认证信息。'}
            </p>
          </div>
        </div>
        {mode === 'custom-provider' && onRemove && (
          <button type="button" className={styles.editorDanger} onClick={() => void onRemove()}>
            <Trash2 size={14} />
            删除
          </button>
        )}
      </header>
      <form className={styles.editorForm} onSubmit={(event: FormEvent) => void form.submit(event)}>
        <div className={styles.editorIcon} aria-hidden>
          {form.isYolo ? <ScanLine size={25} /> : <Server size={25} />}
        </div>
        <ModelProviderEditorFields
          isYolo={form.isYolo}
          isBuiltin={form.isBuiltin}
          name={form.name}
          setName={form.setName}
          baseUrl={form.baseUrl}
          setBaseUrl={form.setBaseUrl}
          modelIds={form.modelIds}
          setModelIds={form.setModelIds}
          weightsPath={form.weightsPath}
          setWeightsPath={form.setWeightsPath}
          apiKey={form.apiKey}
          setApiKey={form.setApiKey}
          hasKey={form.hasKey}
          clearKey={() => void form.clearKey()}
        />
        <footer className={styles.editorFooter}>
          <button type="button" className={styles.secondaryButton} onClick={onBack}>
            取消
          </button>
          <button type="submit" className={styles.primaryButton} disabled={form.saving}>
            {form.saving ? '保存中' : '保存'}
          </button>
        </footer>
      </form>
    </motion.section>
  );
}
