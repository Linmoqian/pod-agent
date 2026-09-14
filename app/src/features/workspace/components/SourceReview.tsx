/*
 * 展示数据源识别结果并只要求确认歧义字段映射。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { SourceCandidate } from '../types';
import styles from './SourceReview.module.css';

/* 未映射哨兵值:shadcn Select 无 allowClear,用显式选项替代 */
const NONE = '__none__';

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
      <Alert>
        <AlertTitle>无法自动识别</AlertTitle>
        <AlertDescription>
          {candidate.name}：{candidate.ambiguities[0]}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.heading}>
        <b>{candidate.name}</b>
        <small>
          {candidate.rowCount} 行 · {candidate.traits.length} 个候选性状
        </small>
      </div>
      {candidate.ambiguities.map((item) => (
        <Alert key={item}>
          <AlertDescription>{item}</AlertDescription>
        </Alert>
      ))}
      {candidate.sheets.map((sheet) => (
        <div key={sheet} className={styles.mappingGrid}>
          <strong>{sheet}</strong>
          {Object.entries(ROLE_LABELS).map(([role, label]) => (
            <label key={role}>
              <span>{label}</span>
              <Select
                value={value?.[sheet]?.[role] ?? NONE}
                onValueChange={(column) =>
                  onChange({
                    ...value,
                    [sheet]: {
                      ...(value?.[sheet] ?? {}),
                      [role]: column === NONE ? null : column,
                    },
                  })
                }
              >
                <SelectTrigger aria-label={label}>
                  <SelectValue placeholder="未映射" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>未映射</SelectItem>
                  {candidate.columns.map((column) => (
                    <SelectItem key={column} value={column}>
                      {column}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}
