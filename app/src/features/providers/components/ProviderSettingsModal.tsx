/*
 * 模型提供商设置面板:当前模型选择、内置提供商密钥、自定义 OpenAI 兼容端点。
 * 数据流见 hooks/useProviderSettings;密钥经 CredentialStore 持久化。
 * Created on 2026-09-09
 * Updated on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { LayoutGrid, Server } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogOverlay,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import useProviderSettings from "../hooks/useProviderSettings";
import type { ModelSelection } from "../types";
import CustomProviderList from "./CustomProviderList";
import ProviderKeyForm from "./ProviderKeyForm";
import styles from "./ProviderSettingsModal.module.css";

type ProviderSettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

function toSelectionValue(
  selection: ModelSelection | null,
): string | undefined {
  return selection ? `${selection.providerId}/${selection.modelId}` : undefined;
}

function ProviderSettingsModal({ open, onClose }: ProviderSettingsModalProps) {
  const {
    rows,
    currentModel,
    modelGroups,
    saveKey,
    clearKey,
    addCustom,
    removeCustom,
    refreshCustomModels,
    selectModel,
  } = useProviderSettings();

  const builtinRows = rows.filter((row) => !row.custom);
  const customRows = rows.filter((row) => row.custom);
  const totalModels = modelGroups.reduce(
    (sum, group) => sum + group.options.length,
    0,
  );

  const handleChange = (value?: string) => {
    if (!value) {
      selectModel(null);
      return;
    }
    const separator = value.indexOf("/");
    selectModel({
      providerId: value.slice(0, separator),
      modelId: value.slice(separator + 1),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogOverlay className={styles.modalOverlay} />
      <DialogContent
        className={`${styles.modalContent} max-h-[90dvh] overflow-y-auto sm:max-w-[680px]`}>
        <DialogHeader>
          <DialogTitle className={styles.modalTitle}>模型提供商</DialogTitle>
        </DialogHeader>
      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>
          <LayoutGrid size={16} strokeWidth={1.75} />
          当前模型
          <span className={styles.sectionHint}>共 {totalModels} 个可选</span>
        </h4>
        {/* shadcn Select 无搜索;按提供商分组平铺,后续可升级 cmdk Combobox */}
        <Select
          value={toSelectionValue(currentModel)}
          onValueChange={handleChange}
        >
          <SelectTrigger
            className={styles.modelSelector}
            aria-label="选择当前模型"
          >
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

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>
          <Server size={16} strokeWidth={1.75} />
          内置提供商密钥
        </h4>
        {builtinRows.map((row) => (
          <div key={row.id} className={styles.providerRow}>
            <div className={styles.providerMeta}>
              <span className={styles.providerName}>{row.name}</span>
              <span className={styles.providerUrl}>{row.baseUrl}</span>
            </div>
            <ProviderKeyForm
              providerId={row.id}
              keyPreview={row.keyPreview}
              onSave={saveKey}
              onClear={clearKey}
            />
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>
          <Server size={16} strokeWidth={1.75} />
          自定义 OpenAI 兼容端点
          <span className={styles.sectionHint}>
            适用于 Ollama、vLLM、LM Studio 等
          </span>
        </h4>
        <CustomProviderList
          customRows={customRows}
          onAdd={addCustom}
          onRemove={removeCustom}
          onRefreshModels={refreshCustomModels}
        />
      </section>
      </DialogContent>
    </Dialog>
  );
}

export default ProviderSettingsModal;
