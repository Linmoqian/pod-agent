/*
 * 自定义 OpenAI 兼容端点列表:展示、刷新模型目录、删除与新增表单。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { useState } from "react";
import { App, Button, Input } from "antd";
import AppIcon from "../../../components/common/AppIcon";
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
  const { message } = App.useApp();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const submit = () => {
    const trimmedName = name.trim();
    const trimmedUrl = baseUrl.trim();
    if (!trimmedName || !/^https?:\/\/.+/.test(trimmedUrl)) {
      void message.warning("请填写端点名称与 http(s) 地址");
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
        void message.error(`刷新失败:${error}`);
      } else {
        void message.success("模型目录已刷新");
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
              size="small"
              icon={<AppIcon name="refresh" size={14} />}
              loading={refreshingId === row.id}
              onClick={() => void refresh(row.id)}
            >
              刷新模型
            </Button>
            <Button
              size="small"
              danger
              aria-label={`删除 ${row.name}`}
              icon={<AppIcon name="delete" size={14} />}
              onClick={() => onRemove(row.id)}
            />
          </div>
        </div>
      ))}

      <div className={styles.customAddForm}>
        <Input
          size="small"
          value={name}
          placeholder="端点名称,如 本地 Ollama"
          aria-label="自定义端点名称"
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          size="small"
          value={baseUrl}
          placeholder="http://localhost:11434/v1"
          aria-label="自定义端点地址"
          onChange={(event) => setBaseUrl(event.target.value)}
          onPressEnter={submit}
        />
        <Button
          size="small"
          type="primary"
          icon={<AppIcon name="add" size={14} />}
          disabled={!name.trim() || !baseUrl.trim()}
          onClick={submit}
        >
          添加
        </Button>
      </div>
    </div>
  );
}

export default CustomProviderList;
