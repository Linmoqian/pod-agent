/*
 * 提供商密钥行:密钥尾缀预览 + 输入保存 + 清除。
 * 内置提供商与自定义端点复用同一交互。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { useState } from "react";
import { KeyRound, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.keyForm}>
      {/* Badge 配置态走品牌绿,未配置走中性描边 */}
      <Badge
        variant="outline"
        data-configured={Boolean(keyPreview)}
        className={`${styles.keyTag} h-6 gap-1 px-2 font-normal`}
      >
        <KeyRound size={12} strokeWidth={1.75} aria-hidden />
        {keyPreview ?? "未配置密钥"}
      </Badge>
      <Input
        type="password"
        className="h-8"
        value={value}
        placeholder="输入 API Key"
        aria-label={`${providerId} 密钥输入`}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
        }}
      />
      <Button
        size="sm"
        className="h-8"
        disabled={saving || !value.trim()}
        onClick={() => void submit()}
      >
        {saving && (
          <motion.span
            aria-hidden
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, ease: 'linear', repeat: Infinity }}
          >
            <Loader2 size={14} strokeWidth={1.75} />
          </motion.span>
        )}
        保存
      </Button>
      {keyPreview && (
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => {
            void onClear(providerId).catch((error) => {
              toast.error(error instanceof Error ? error.message : String(error));
            });
          }}
        >
          清除
        </Button>
      )}
    </div>
  );
}

export default ProviderKeyForm;
