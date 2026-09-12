/*
 * 展示数据源识别结果并只要求确认歧义字段映射。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { Alert, Select } from 'antd';

import type { SourceCandidate } from '../types';
import styles from './SourceReview.module.css';

const ROLE_LABELS: Record<string, string> = {
  material: '材料标识',
  environment: '环境',
  replicate: '重复',
  block: '区组',
  trait: '性状',
  value: '数值',
  unit: '单位',
};

export type FieldMapping = Record<string, Record<string, string | null>>;

type SourceReviewProps = {
  candidate: SourceCandidate;
  value: FieldMapping;
  onChange: (value: FieldMapping) => void;
};

export default function SourceReview({
  candidate,
  value,
  onChange,
}: SourceReviewProps) {
  if (!candidate.supported) {
    return (
      <Alert
        type="warning"
        title={`${candidate.name}：${candidate.ambiguities[0]}`}
      />
    );
  }

  const options = candidate.columns.map((column) => ({
    label: column,
    value: column,
  }));

  return (
    <div className={styles.card}>
      <div className={styles.heading}>
        <b>{candidate.name}</b>
        <small>
          {candidate.rowCount} 行 · {candidate.traits.length} 个候选性状
        </small>
      </div>
      {candidate.ambiguities.map((item) => (
        <Alert key={item} type="warning" showIcon title={item} />
      ))}
      {candidate.sheets.map((sheet) => (
        <div key={sheet} className={styles.mappingGrid}>
          <strong>{sheet}</strong>
          {Object.entries(ROLE_LABELS).map(([role, label]) => (
            <label key={role}>
              <span>{label}</span>
              <Select
                allowClear
                value={value?.[sheet]?.[role] ?? undefined}
                options={options}
                onChange={(column) =>
                  onChange({
                    ...value,
                    [sheet]: {
                      ...(value?.[sheet] ?? {}),
                      [role]: column ?? null,
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}
