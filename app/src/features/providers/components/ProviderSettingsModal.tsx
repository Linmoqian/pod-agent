/*
 * 模型提供商设置面板:当前模型选择、内置提供商密钥、自定义 OpenAI 兼容端点。
 * 数据流见 hooks/useProviderSettings;密钥经 macOS Keychain 持久化。
 * Created on 2026-09-09
 * Updated on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { BrainCircuit, ChevronLeft, LayoutGrid, Plus, ScanLine, Search, Server, Trash2 } from 'lucide-react';
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
import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { errorText } from "../../../services/errors";
import useProviderSettings from "../hooks/useProviderSettings";
import { isValidCustomProviderUrl } from "../services/registry";
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

type AddModelType = "llm" | "yolo";

type ConfiguredModel = {
  id: string;
  providerId?: string;
  name: string;
  type: AddModelType;
  source: string;
  detail: string;
};

type ModelListProps = {
  models: ConfiguredModel[];
  onRemoveLlm: (providerId: string) => void;
  onRemoveYolo: (modelId: string) => void;
};

function ModelList({ models, onRemoveLlm, onRemoveYolo }: ModelListProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | AddModelType>("all");
  const filteredModels = models.filter((model) => {
    const matchesQuery = `${model.name}${model.source}${model.detail}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
    return matchesQuery && (typeFilter === "all" || model.type === typeFilter);
  });

  const removeModel = (model: ConfiguredModel) => {
    if (model.type === "llm") onRemoveLlm(model.providerId ?? model.id);
    else onRemoveYolo(model.id);
  };

  return (
    <section className={styles.section} aria-label="模型列表">
      <h4 className={styles.sectionTitle}>
        <LayoutGrid size={16} strokeWidth={1.75} />
        模型列表
        <span className={styles.sectionHint}>已添加 {models.length} 个</span>
      </h4>
      <div className={styles.modelFilters}>
        <label className={styles.modelSearch}>
          <Search size={15} aria-hidden />
          <input
            aria-label="搜索模型"
            value={query}
            placeholder="搜索模型"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          className={styles.typeFilter}
          aria-label="筛选模型类型"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as "all" | AddModelType)}
        >
          <option value="all">全部类型</option>
          <option value="llm">LLM</option>
          <option value="yolo">YOLO</option>
        </select>
      </div>
      <div className={styles.modelTableWrap}>
        <table className={styles.modelTable}>
          <thead>
            <tr>
              <th scope="col">模型</th>
              <th scope="col">类型</th>
              <th scope="col">来源</th>
              <th scope="col">配置</th>
              <th scope="col"><span className="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody>
            {filteredModels.map((model) => (
              <tr key={model.id}>
                <td className={styles.modelName}>{model.name}</td>
                <td>
                  <Badge variant="outline" className={styles.modelType} data-type={model.type}>
                    {model.type === "llm" ? "LLM" : "YOLO"}
                  </Badge>
                </td>
                <td>{model.source}</td>
                <td className={styles.modelDetail} title={model.detail}>{model.detail}</td>
                <td>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label={`删除 ${model.name}`}
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeModel(model)}
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </Button>
                </td>
              </tr>
            ))}
            {!filteredModels.length && (
              <tr>
                <td className={styles.emptyModelList} colSpan={5}>
                  {models.length ? "没有匹配的模型" : "通过“添加模型”创建对话或图片识别模型"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AddModelForm({
  onAddLlm,
  onAddYolo,
}: {
  onAddLlm: (name: string, baseUrl: string, key: string) => Promise<void>;
  onAddYolo: (name: string, weightsPath: string) => void;
}) {
  const reduced = useReducedMotion();
  const [name, setName] = useState("");
  const [type, setType] = useState<AddModelType | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [weightsPath, setWeightsPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const reset = () => {
    setName("");
    setType(null);
    setBaseUrl("");
    setApiKey("");
    setWeightsPath("");
    setExpanded(false);
  };

  const submit = async () => {
    if (saving) return;
    const trimmedName = name.trim();
    if (!trimmedName || !type) return;
    if (type === "llm") {
      if (!isValidCustomProviderUrl(baseUrl.trim()) || !apiKey.trim()) {
        toast.warning("请填写 API Key 与有效的 Base URL");
        return;
      }
      setSaving(true);
      try {
        await onAddLlm(trimmedName, baseUrl.trim(), apiKey);
        toast.success("LLM 模型已添加");
        reset();
      } catch (error) {
        toast.error(errorText(error));
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!weightsPath.trim()) {
      toast.warning("请填写 YOLO 权重地址");
      return;
    }
    onAddYolo(trimmedName, weightsPath.trim());
    toast.success("YOLO 模型配置已添加");
    reset();
  };

  return (
    <section className={styles.section} aria-label="添加模型">
      <div className={styles.sectionHeader}>
        <h4 className={styles.sectionTitle}>
          <Plus size={16} strokeWidth={1.75} />
          添加模型
        </h4>
        {!expanded && (
          <Button
            size="sm"
            variant="outline"
            className={styles.sectionAction}
            onClick={() => setExpanded(true)}
          >
            <Plus size={14} aria-hidden />
            添加模型
          </Button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className={styles.addModelForm}
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduced ? undefined : { opacity: 0, height: 0 }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 460, damping: 36, mass: 0.7 }}
          >
        <Input
          value={name}
          aria-label="模型名称"
          placeholder="模型名称，如 Qwen3-32B 或 豆荚检测"
          onChange={(event) => setName(event.target.value)}
        />
        {name.trim() && !type && (
          <motion.div
            className={styles.typeChoices}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 460, damping: 34, mass: 0.65 }}
          >
            <button type="button" onClick={() => setType("llm")}>
              <BrainCircuit size={18} strokeWidth={1.75} />
              <span><strong>LLM</strong><small>对话与文本推理</small></span>
            </button>
            <button type="button" onClick={() => setType("yolo")}>
              <ScanLine size={18} strokeWidth={1.75} />
              <span><strong>YOLO</strong><small>图片目标检测</small></span>
            </button>
          </motion.div>
        )}
        <AnimatePresence mode="wait" initial={false}>
          {type && (
            <motion.div
              key={type}
              className={styles.modelDetails}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -4 }}
              transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 460, damping: 34, mass: 0.65 }}
            >
              <button
                type="button"
                className={styles.backButton}
                aria-label="重新选择模型类型"
                onClick={() => setType(null)}
              >
                <ChevronLeft size={15} />
                {type === "llm" ? "LLM" : "YOLO"}
              </button>
              {type === "llm" ? (
                <>
                  <Input value={baseUrl} aria-label="LLM Base URL" placeholder="Base URL，如 https://api.example.com/v1" onChange={(event) => setBaseUrl(event.target.value)} />
                  <Input type="password" value={apiKey} aria-label="LLM API Key" placeholder="API Key" onChange={(event) => setApiKey(event.target.value)} />
                </>
              ) : (
                <Input value={weightsPath} aria-label="YOLO 权重地址" placeholder="权重地址，如 /models/pod-detector.onnx" onChange={(event) => setWeightsPath(event.target.value)} />
              )}
              <div className={styles.formActions}>
                <Button size="sm" variant="outline" onClick={reset}>取消</Button>
                <Button size="sm" disabled={saving || !name.trim()} onClick={() => void submit()}>
                  <Plus size={14} aria-hidden />
                  {saving ? "添加中" : "添加模型"}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export function ProviderSettingsPanel() {
  const {
    rows,
    customProviders,
    currentModel,
    modelGroups,
    saveKey,
    clearKey,
    addCustom,
    addLlm,
    addYolo,
    removeCustom,
    removeYolo,
    refreshCustomModels,
    selectModel,
    customYoloModels,
  } = useProviderSettings();

  const builtinRows = rows.filter((row) => !row.custom);
  const customRows = rows.filter((row) => row.custom);
  const configuredModels: ConfiguredModel[] = [
    ...customProviders
      .flatMap((provider) =>
        (provider.modelIds ?? (provider.modelId ? [provider.modelId] : []))
          .map((modelId) => ({
            id: `${provider.id}/${modelId}`,
            providerId: provider.id,
            name: modelId,
            type: "llm" as const,
            source: provider.name,
            detail: provider.baseUrl,
          })),
      ),
    ...customYoloModels.map((model) => ({
      id: model.id,
      name: model.name,
      type: "yolo" as const,
      source: "本地权重",
      detail: model.weightsPath,
    })),
  ];
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
    if (separator <= 0 || separator === value.length - 1) {
      selectModel(null);
      return;
    }
    selectModel({
      providerId: value.slice(0, separator),
      modelId: value.slice(separator + 1),
    });
  };

  return (
    <section className={styles.providerPanel} aria-labelledby="settings-model">
      <header className={styles.panelHeader}>
        <h3 id="settings-model" className={styles.panelTitle}>
          模型
        </h3>
        <p className={styles.panelDescription}>
          配置对话、图片识别以及自定义端点使用的模型。
        </p>
      </header>
      <AddModelForm onAddLlm={addLlm} onAddYolo={addYolo} />
      <ModelList
        models={configuredModels}
        onRemoveLlm={removeCustom}
        onRemoveYolo={removeYolo}
      />
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
          onSaveKey={saveKey}
          onClearKey={clearKey}
        />
      </section>

    </section>
  );
}

function ProviderSettingsModal({ open, onClose }: ProviderSettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogOverlay className={styles.modalOverlay} />
      <DialogContent
        className={`${styles.modalContent} max-h-[90dvh] overflow-y-auto sm:max-w-[680px]`}>
        <DialogHeader>
          <DialogTitle className={styles.modalTitle}>模型提供商</DialogTitle>
        </DialogHeader>
        <ProviderSettingsPanel />
      </DialogContent>
    </Dialog>
  );
}

export default ProviderSettingsModal;
