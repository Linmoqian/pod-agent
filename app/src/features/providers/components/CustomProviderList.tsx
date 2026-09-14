/*
 * 自定义 OpenAI 兼容端点列表:展示、刷新模型目录、删除与新增表单。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { useState } from "react";
import { Plus, RotateCw, Trash2 } from 'lucide-react';
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProviderRow } from "../hooks/useProviderSettings";
import styles from "./ProviderSettingsModal.module.css";

type CustomProviderListProps = {
  customRows: ProviderRow[];
  onAdd: (name: string, baseUrl: string) => void;
  onRemove: (providerId: string) => void;
  onRefreshModels: (providerId: string) => Promise<string | null>;
};

function CustomProviderList({
  customRows,
  onAdd,
  onRemove,
  onRefreshModels,
}: CustomProviderListProps) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const submit = () => {
    const trimmedName = name.trim();
    const trimmedUrl = baseUrl.trim();
    if (!trimmedName || !/^https?:\/\/.+/.test(trimmedUrl)) {
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
              <RotateCw
                size={14}
                strokeWidth={1.75}
                className={refreshingId === row.id ? "animate-spin" : undefined}
                aria-hidden
              />
              刷新模型
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              aria-label={`删除 ${row.name}`}
              className="text-destructive hover:text-destructive"
              onClick={() => onRemove(row.id)}
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </Button>
          </div>
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
