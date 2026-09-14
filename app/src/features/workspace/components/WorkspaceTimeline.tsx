/*
 * 展示 Project 内消息时间线与待确认的数据识别结果。
 * Created on 2026-09-12
 * Updated on 2026-09-13
 * @author: https://github.com/Linmoqian
 */

import { Button, Select } from 'antd';
import { useEffect, useState } from 'react';

import BrandMark from '../../../components/common/BrandMark';
import type {
  ImportInspection,
  SourceCandidate,
  TimelineMessage,
} from '../types';
import type { FieldMapping } from './SourceReview';
import SourceReview from './SourceReview';
import styles from './WorkspaceTimeline.module.css';

type WorkspaceTimelineProps = {
  messages: TimelineMessage[];
  inspection: ImportInspection | null;
  mappingEdits: Record<string, FieldMapping>;
  onMappingChange: (sourceId: string, value: FieldMapping) => void;
  onRegister: (
    candidates: SourceCandidate[],
    projectId: string,
    importSessionId: string,
    materialResolutions: Record<string, string>,
  ) => void;
};

function WelcomeWorkspace() {
  return (
    <div className={styles.welcome}>
      <BrandMark size={56} />
      <h1>需要一起探索什么？</h1>
    </div>
  );
}

export default function WorkspaceTimeline({
  messages,
  inspection,
  mappingEdits,
  onMappingChange,
  onRegister,
}: WorkspaceTimelineProps) {
  const supported =
    inspection?.candidates.filter((candidate) => candidate.supported) ?? [];
  const suggestions = supported.flatMap(
    (candidate) => candidate.identitySuggestions ?? [],
  );
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  useEffect(() => setResolutions({}), [inspection?.importSessionId]);

  return (
    <div className={styles.timeline}>
      {messages.map((item) => (
        <div key={item.id} className={styles.message} data-role={item.role}>
          <small>{item.role === 'user' ? '你' : 'lian'}</small>
          <p>{item.content}</p>
        </div>
      ))}
      {inspection && (
        <section className={styles.inspection}>
          <h3>数据识别</h3>
          {inspection.candidates.map((candidate) => (
            <SourceReview
              key={candidate.sourceId || candidate.name}
              candidate={candidate}
              value={
                mappingEdits[candidate.sourceId] ?? candidate.inferredMapping
              }
              onChange={(value) => onMappingChange(candidate.sourceId, value)}
            />
          ))}
          {suggestions.map((suggestion) => (
            <div
              key={`${suggestion.sourceValue}-${suggestion.targetMaterialId}`}
            >
              <span>
                {suggestion.sourceValue} 可能对应 {suggestion.targetCode}
              </span>
              <Select
                aria-label={`材料 ${suggestion.sourceValue} 的身份决策`}
                placeholder="请选择"
                value={resolutions[suggestion.sourceValue]}
                options={[
                  {
                    value: suggestion.targetMaterialId,
                    label: `链接 ${suggestion.targetCode}`,
                  },
                  { value: 'new', label: '创建新材料' },
                ]}
                onChange={(value) =>
                  setResolutions((current) => ({
                    ...current,
                    [suggestion.sourceValue]: value,
                  }))
                }
              />
            </div>
          ))}
          {supported.length > 0 && (
            <Button
              type="primary"
              disabled={suggestions.some(
                (item) => !resolutions[item.sourceValue],
              )}
              onClick={() =>
                onRegister(
                  supported,
                  inspection.projectId,
                  inspection.importSessionId,
                  resolutions,
                )
              }
            >
              确认识别并登记全部可分析数据
            </Button>
          )}
        </section>
      )}
      {!messages.length && !inspection && <WelcomeWorkspace />}
    </div>
  );
}
