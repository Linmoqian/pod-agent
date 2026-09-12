/*
 * 展示 Project 内消息时间线与待确认的数据识别结果。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { Button } from 'antd';

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
  onRegister: (candidates: SourceCandidate[], projectId: string) => void;
};

export default function WorkspaceTimeline({
  messages,
  inspection,
  mappingEdits,
  onMappingChange,
  onRegister,
}: WorkspaceTimelineProps) {
  const supported =
    inspection?.candidates.filter((candidate) => candidate.supported) ?? [];

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
          {supported.length > 0 && (
            <Button
              type="primary"
              onClick={() => onRegister(supported, inspection.projectId)}
            >
              确认识别并登记全部可分析数据
            </Button>
          )}
        </section>
      )}
      {!messages.length && !inspection && (
        <div className={styles.welcome}>
          <div className={styles.mark}>
            <AppIcon name="brand-sprout" size={34} />
          </div>
          <h1>今天想研究什么？</h1>
          <p>描述问题，或直接拖入多环境表型数据。</p>
        </div>
      )}
    </div>
  );
}
