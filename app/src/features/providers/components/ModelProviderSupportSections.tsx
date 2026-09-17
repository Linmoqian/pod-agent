/* 模型设置页的当前模型与图片识别模型区块。
 * Created on 2026-09-17
 * @author: https://github.com/Linmoqian
 */

import { BrainCircuit, LayoutGrid, Plus, ScanLine, Trash2 } from 'lucide-react';

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ModelOptionGroup } from '../hooks/useProviderSettings';
import type { CustomYoloModelConfig } from '../types';
import { IconAction } from './ModelProviderCard';
import styles from './ModelProviderSettings.module.css';

export function CurrentModelSection({
  currentModel,
  modelGroups,
  totalModels,
  onChange,
}: {
  currentModel: { providerId: string; modelId: string } | null;
  modelGroups: ModelOptionGroup[];
  totalModels: number;
  onChange: (value?: string) => void;
}) {
  const value = currentModel ? `${currentModel.providerId}/${currentModel.modelId}` : undefined;
  return (
    <section className={styles.section} aria-label="当前模型">
      <div className={styles.sectionHeader}>
        <h4 className={styles.sectionTitle}>
          <LayoutGrid size={16} strokeWidth={1.75} />
          当前模型
        </h4>
        <span className={styles.sectionHint}>共 {totalModels} 个可选</span>
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label="选择当前模型">
          <SelectValue placeholder="选择对话使用的模型" />
        </SelectTrigger>
        <SelectContent>
          {modelGroups.map((group) => (
            <SelectGroup key={group.providerId}>
              <SelectLabel>{group.providerName}</SelectLabel>
              {group.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </section>
  );
}

export function YoloModelsSection({
  models,
  onAdd,
  onRemove,
}: {
  models: CustomYoloModelConfig[];
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className={styles.section} aria-label="图片识别模型">
      <div className={styles.sectionHeader}>
        <h4 className={styles.sectionTitle}>
          <ScanLine size={16} strokeWidth={1.75} />
          图片识别模型
          <span className={styles.sectionHint}>{models.length} 个</span>
        </h4>
        <button type="button" className={styles.secondaryButton} onClick={onAdd}>
          <Plus size={14} />
          添加
        </button>
      </div>
      {models.length ? (
        <div className={styles.modelList}>
          {models.map((model) => (
            <div className={styles.modelRow} key={model.id}>
              <span className={styles.modelIcon} aria-hidden>
                <BrainCircuit size={16} strokeWidth={1.75} />
              </span>
              <span className={styles.modelCopy}>
                <strong>{model.name}</strong>
                <span className={styles.modelMeta}>{model.weightsPath}</span>
              </span>
              <IconAction label={`删除 ${model.name}`} onClick={() => onRemove(model.id)} danger>
                <Trash2 size={15} />
              </IconAction>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>尚未添加图片识别模型</p>
      )}
    </section>
  );
}
