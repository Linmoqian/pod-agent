/*
 * 自定义 OpenAI 兼容端点列表:展示、刷新模型目录、删除与新增表单。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { useState } from "react";
import { Plus, RotateCw, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProviderRow } from "../hooks/useProviderSettings";
import { isValidCustomProviderUrl } from "../services/registry";
import styles from "./ProviderSettingsModal.module.css";
import ProviderKeyForm from "./ProviderKeyForm";

type CustomProviderListProps = {
  customRows: ProviderRow[];
  onAdd: (name: string, baseUrl: string) => void;
  onRemove: (providerId: string) => void | Promise<void>;
  onRefreshModels: (providerId: string) => Promise<string | null>;
  onSaveKey: (providerId: string, key: string) => Promise<void>;
  onClearKey: (providerId: string) => Promise<void>;
};

function CustomProviderList({
  customRows,
  onAdd,
  onRemove,
  onRefreshModels,
  onSaveKey,
  onClearKey,
}: CustomProviderListProps) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const submit = () => {
    const trimmedName = name.trim();
    const trimmedUrl = baseUrl.trim();
    if (!trimmedName || !isValidCustomProviderUrl(trimmedUrl)) {
      toast.warning("请填写端点名称与 http(s) 地址");
      return;
    }
    onAdd(trimmedName, trimmedUrl);
    setName("");
    setBaseUrl("");
  };

  const refresh = async (providerId: string) => {
    setRefreshingId(providerId);
    try {
      const error = await onRefreshModels(providerId);
      if (error) {
        toast.error(`刷新失败:${error}`);
      } else {
        toast.success("模型目录已刷新");
      }
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <div className={styles.customList}>
      {customRows.map((row) => (
        <div key={row.id} className={styles.customRow}>
          <div className={styles.customTop}>
            <div className={styles.customMeta}>
              <span className={styles.customName}>{row.name}</span>
              <span className={styles.customUrl}>{row.baseUrl}</span>
            </div>
            <div className={styles.customActions}>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={refreshingId === row.id}
                onClick={() => void refresh(row.id)}
              >
                <motion.span
                  aria-hidden
                  animate={refreshingId === row.id ? { rotate: 360 } : { rotate: 0 }}
                  transition={{ duration: 0.8, ease: 'linear', repeat: refreshingId === row.id ? Infinity : 0 }}
                >
                  <RotateCw size={14} strokeWidth={1.75} />
                </motion.span>
                刷新模型
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label={`删除 ${row.name}`}
                className="text-destructive hover:text-destructive"
                onClick={() => void onRemove(row.id)}
              >
                <Trash2 size={14} strokeWidth={1.75} />
              </Button>
            </div>
          </div>
          <ProviderKeyForm
            providerId={row.id}
            keyPreview={row.keyPreview}
            onSave={onSaveKey}
            onClear={onClearKey}
          />
        </div>
      ))}

      <div className={styles.customAddForm}>
        <Input
          className="h-8"
          value={name}
          placeholder="端点名称,如 本地 Ollama"
          aria-label="自定义端点名称"
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          className="h-8"
          value={baseUrl}
          placeholder="http://localhost:11434/v1"
          aria-label="自定义端点地址"
          onChange={(event) => setBaseUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
        <Button
          size="sm"
          className="h-8"
          disabled={!name.trim() || !baseUrl.trim()}
          onClick={submit}
        >
          <Plus size={14} strokeWidth={1.75} aria-hidden />
          添加
        </Button>
      </div>
    </div>
  );
}

export default CustomProviderList;
