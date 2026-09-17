/* 模型供应商列表、当前模型与图片识别模型入口。
 * Created on 2026-09-17
 * @author: https://github.com/Linmoqian
 */

import { Plus, Server } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

import type { ModelOptionGroup, ProviderRow } from '../hooks/useProviderSettings';
import type { CustomProviderConfig, CustomYoloModelConfig } from '../types';
import ModelProviderCard from './ModelProviderCard';
import { CurrentModelSection, YoloModelsSection } from './ModelProviderSupportSections';
import styles from './ModelProviderSettings.module.css';

function modelIdsFor(config?: CustomProviderConfig): string[] {
  return config?.modelIds ?? (config?.modelId ? [config.modelId] : []);
}

export type ModelProviderOverviewProps = {
  rows: ProviderRow[];
  customProviders: CustomProviderConfig[];
  customYoloModels: CustomYoloModelConfig[];
  currentModel: { providerId: string; modelId: string } | null;
  modelGroups: ModelOptionGroup[];
  onAdd: () => void;
  onOpen: (providerId: string, custom: boolean) => void;
  onRefresh: (providerId: string) => void;
  onRemove: (providerId: string) => void;
  onAddYolo: () => void;
  onRemoveYolo: (id: string) => void;
  refreshingId: string | null;
  onChangeModel: (value?: string) => void;
};

export default function ModelProviderOverview({
  rows,
  customProviders,
  customYoloModels,
  currentModel,
  modelGroups,
  onAdd,
  onOpen,
  onRefresh,
  onRemove,
  onAddYolo,
  onRemoveYolo,
  refreshingId,
  onChangeModel,
}: ModelProviderOverviewProps) {
  const reduced = useReducedMotion();
  const customById = new Map(customProviders.map((provider) => [provider.id, provider]));
  const groupById = new Map(modelGroups.map((group) => [group.providerId, group]));
  const totalModels = modelGroups.reduce((sum, group) => sum + group.options.length, 0);
  return (
    <motion.section
      className={styles.panel}
      initial={reduced ? false : { opacity: 0, transform: 'translateY(4px)' }}
      animate={{ opacity: 1, transform: 'translateY(0)' }}
      transition={reduced ? { duration: 0 } : { duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
    >
      <header className={styles.overviewHeader}>
        <div className={styles.overviewCopy}>
          <h3 className={styles.title}>模型</h3>
          <p className={styles.description}>管理对话和图片识别使用的模型供应商。</p>
        </div>
        <button type="button" className={styles.primaryButton} onClick={onAdd}>
          <Plus size={15} />
          添加供应商
        </button>
      </header>

      <section className={styles.section} aria-label="模型供应商列表">
        <div className={styles.sectionHeader}>
          <h4 className={styles.sectionTitle}>
            <Server size={16} strokeWidth={1.75} />
            模型供应商
          </h4>
          <span className={styles.sectionHint}>{rows.length} 个</span>
        </div>
        {rows.length ? (
          <div className={styles.providerList}>
            {rows.map((row) => {
              const config = customById.get(row.id);
              const modelCount = groupById.get(row.id)?.options.length ?? modelIdsFor(config).length;
              return (
                <ModelProviderCard
                  key={row.id}
                  row={row}
                  selected={currentModel?.providerId === row.id}
                  modelSummary={modelCount ? `${modelCount} 个模型` : '尚未刷新模型'}
                  onOpen={() => onOpen(row.id, row.custom)}
                  onRefresh={row.custom ? () => onRefresh(row.id) : undefined}
                  onRemove={row.custom ? () => onRemove(row.id) : undefined}
                  refreshing={refreshingId === row.id}
                />
              );
            })}
          </div>
        ) : (
          <p className={styles.empty}>正在读取模型供应商…</p>
        )}
      </section>

      <CurrentModelSection
        currentModel={currentModel}
        modelGroups={modelGroups}
        totalModels={totalModels}
        onChange={onChangeModel}
      />
      <YoloModelsSection models={customYoloModels} onAdd={onAddYolo} onRemove={onRemoveYolo} />
    </motion.section>
  );
}
