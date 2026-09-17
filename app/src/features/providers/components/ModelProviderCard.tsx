/* 模型供应商列表卡片与紧凑操作按钮。
 * Created on 2026-09-17
 * @author: https://github.com/Linmoqian
 */

import { Pencil, RefreshCw, Server, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import type { ProviderRow } from '../hooks/useProviderSettings';
import styles from './ModelProviderSettings.module.css';

export function IconAction({
  label,
  onClick,
  children,
  disabled = false,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-label={label}
      title={label}
      data-danger={danger ? 'true' : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default function ModelProviderCard({
  row,
  selected,
  modelSummary,
  onOpen,
  onRefresh,
  onRemove,
  refreshing,
}: {
  row: ProviderRow;
  selected: boolean;
  modelSummary: string;
  onOpen: () => void;
  onRefresh?: () => void;
  onRemove?: () => void;
  refreshing: boolean;
}) {
  const ready = Boolean(row.keyPreview);
  return (
    <article className={styles.providerCard} data-selected={selected ? 'true' : undefined}>
      <button type="button" className={styles.cardMain} onClick={onOpen}>
        <span className={styles.cardIcon} aria-hidden>
          <Server size={17} strokeWidth={1.75} />
        </span>
        <span className={styles.cardCopy}>
          <strong>{row.name}</strong>
          <span className={styles.cardMeta}>{row.baseUrl ?? '内置提供商'} · {modelSummary}</span>
        </span>
        <span className={styles.cardStatus} data-ready={ready ? 'true' : undefined}>
          <i className={styles.statusDot} aria-hidden />
          {ready ? '已配置' : row.custom ? '待配置' : '未配置密钥'}
        </span>
      </button>
      <div className={styles.providerActions}>
        {row.custom && onRefresh && (
          <IconAction label={refreshing ? '刷新模型中' : '刷新模型'} onClick={onRefresh} disabled={refreshing}>
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : undefined} />
          </IconAction>
        )}
        <IconAction label="配置模型" onClick={onOpen}>
          <Pencil size={15} />
        </IconAction>
        {row.custom && onRemove && (
          <IconAction label={`删除 ${row.name}`} onClick={onRemove} danger>
            <Trash2 size={15} />
          </IconAction>
        )}
      </div>
    </article>
  );
}
