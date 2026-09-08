/*
 * 提供商密钥行:密钥尾缀预览 + 输入保存 + 清除。
 * 内置提供商与自定义端点复用同一交互。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { useState } from "react";
import { Button, Input, Tag } from "antd";
import { KeyRound } from "lucide-react";
import styles from "./ProviderSettingsModal.module.css";

type ProviderKeyFormProps = {
  providerId: string;
  keyPreview: string | null;
  onSave: (providerId: string, key: string) => Promise<void>;
  onClear: (providerId: string) => Promise<void>;
};

function ProviderKeyForm({
  providerId,
  keyPreview,
  onSave,
  onClear,
}: ProviderKeyFormProps) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await onSave(providerId, value);
      setValue("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.keyForm}>
      <Tag
        color={keyPreview ? "green" : "default"}
        icon={<KeyRound size={12} aria-hidden />}
        className={styles.keyTag}
      >
        {keyPreview ?? "未配置密钥"}
      </Tag>
      <Input.Password
        size="small"
        value={value}
        placeholder="输入 API Key"
        aria-label={`${providerId} 密钥输入`}
        onChange={(event) => setValue(event.target.value)}
        onPressEnter={submit}
      />
      <Button
        size="small"
        type="primary"
        loading={saving}
        disabled={!value.trim()}
        onClick={submit}
      >
        保存
      </Button>
      {keyPreview && (
        <Button size="small" onClick={() => void onClear(providerId)}>
          清除
        </Button>
      )}
    </div>
  );
}

export default ProviderKeyForm;
