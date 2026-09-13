/*
 * 展示 Project 内消息时间线与待确认的数据识别结果。
 * Created on 2026-09-12
 * Updated on 2026-09-13
 * @author: https://github.com/Linmoqian
 */

import { Button, Select } from 'antd';
import { useEffect, useState } from 'react';

import AppIcon from '../../../components/common/AppIcon';
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
      <div className={styles.welcomeTopline}>
        <span>LIAN RESEARCH COPILOT</span>
        <span aria-hidden />
        <span>本地 · 可追溯</span>
      </div>
      <div className={styles.mark}>
        <AppIcon name="brand-sprout" size={32} />
      </div>
      <h1>
        让数据长成
        <br />
        <em>可靠的结论</em>
      </h1>
      <p>
        提出育种问题，或导入多环境表型数据。lian
        会整理数据、生成分析计划，并保留每一步证据。
      </p>
      <div className={styles.capabilities} aria-label="工作流能力">
        <div>
          <span>01</span>
          <b>理解数据</b>
          <small>识别字段与材料身份</small>
        </div>
        <div>
          <span>02</span>
          <b>规划分析</b>
          <small>先确认，再执行</small>
        </div>
        <div>
          <span>03</span>
          <b>追溯结果</b>
          <small>保留模型与数据血缘</small>
        </div>
      </div>
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
