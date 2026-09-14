/*
 * 展示 Project 内消息时间线与待确认的数据识别结果。
 * Created on 2026-09-12
 * Updated on 2026-09-13
 * @author: https://github.com/Linmoqian
 */

import {
  ArrowDown,
  ArrowUpRight,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  Copy,
  Sparkles,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import MarkdownContent from '../../../components/common/MarkdownContent';
import type {
  ImportInspection,
  SourceCandidate,
  TimelineMessage,
} from '../types';
import type { FieldMapping } from './SourceReview';
import SourceReview from './SourceReview';
import TypewriterMarkdown from './TypewriterMarkdown';
import styles from './WorkspaceTimeline.module.css';

type WorkspaceTimelineProps = {
  onSuggestion?: (value: string) => void;
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

function WelcomeWorkspace({
  onSuggestion,
}: {
  onSuggestion?: (value: string) => void;
}) {
  return (
    <motion.div className={styles.welcome} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
      <div className={styles.welcomeMark}>
        <Sparkles size={25} strokeWidth={1.4} />
      </div>
      <h1>今天想研究什么？</h1>
      <p>从一个想法开始，一起把问题研究清楚。你可以直接提问，也可以先添加数据。</p>
      <div className={styles.suggestions}>
        {[
          '帮我梳理一个研究思路',
          '如何设计多环境育种实验？',
          '解释混合模型与 BLUP',
        ].map((text) => (
          <button key={text} onClick={() => onSuggestion?.(text)}>
            {text}
            <ArrowUpRight size={14} />
          </button>
        ))}
      </div>
      <small className={styles.welcomeTip}>lian 会帮你拆解问题、解释方法，并把结果留在当前工作空间。</small>
    </motion.div>
  );
}

function ReasoningBlock({ reasoning }: { reasoning?: string | null }) {
  const [expanded, setExpanded] = useState(true);
  if (!reasoning?.trim()) return null;
  return (
    <section className={styles.reasoning}>
      <button
        type="button"
        className={styles.reasoningToggle}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <BrainCircuit size={15} strokeWidth={1.75} aria-hidden />
        <span>模型思考</span>
        {expanded ? (
          <ChevronUp size={15} strokeWidth={1.75} aria-hidden />
        ) : (
          <ChevronDown size={15} strokeWidth={1.75} aria-hidden />
        )}
      </button>
      {expanded && (
        <div className={styles.reasoningContent}>
          <MarkdownContent content={reasoning} />
        </div>
      )}
    </section>
  );
}

function supportedCandidates(inspection: ImportInspection | null) {
  return (
    inspection?.candidates.filter((candidate) => candidate.supported) ?? []
  );
}

function PendingReply() {
  return (
    <div className={styles.pendingReply} role="status">
      <span className={styles.pendingDot} aria-hidden />
      正在生成回复
    </div>
  );
}

function StreamingReply({ content }: { content: string }) {
  return (
    <div aria-busy aria-live="polite">
      <MarkdownContent content={content} />
      <span className={styles.typingCursor} aria-hidden />
    </div>
  );
}

function useSeenMessageIds(messages: TimelineMessage[]) {
  const seenMessageIds = useRef(new Set(messages.map((message) => message.id)));
  useEffect(() => {
    messages.forEach((message) => seenMessageIds.current.add(message.id));
  }, [messages]);
  return seenMessageIds;
}

function TimelineMessages({
  messages,
}: Pick<WorkspaceTimelineProps, 'messages'>) {
  const seenMessageIds = useSeenMessageIds(messages);
  return messages.map((item) => (
    <div key={item.id} className={styles.message} data-role={item.role}>
      <small>{item.role === 'user' ? '你' : 'lian'}</small>
      {item.role === 'user' ? (
        <p>{item.content}</p>
      ) : item.status === 'pending' ? (
        <PendingReply />
      ) : item.status === 'streaming' ? (
        <>
          <ReasoningBlock reasoning={item.reasoning} />
          <StreamingReply content={item.content} />
        </>
      ) : (
        <>
          <ReasoningBlock reasoning={item.reasoning} />
          <TypewriterMarkdown
            messageId={item.id}
            content={item.content}
            animate={!seenMessageIds.current.has(item.id)}
          />
          <button
            className={styles.copy}
            aria-label="复制回复"
            onClick={() => {
              void navigator.clipboard
                .writeText(item.content)
                .then(() => toast.success('已复制回复'))
                .catch(() => toast.error('复制失败，请手动选择文本'));
            }}
          >
            <Copy size={13} />
            复制
          </button>
        </>
      )}
    </div>
  ));
}

export default function WorkspaceTimeline({
  messages,
  inspection,
  mappingEdits,
  onMappingChange,
  onRegister,
  onSuggestion,
}: WorkspaceTimelineProps) {
  const scrollArea = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [away, setAway] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    const area = scrollArea.current;
    if (area && follow.current) area.scrollTop = area.scrollHeight;
  }, [messages, inspection]);
  const supported = supportedCandidates(inspection);
  const suggestions = supported.flatMap(
    (candidate) => candidate.identitySuggestions ?? [],
  );
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  useEffect(() => setResolutions({}), [inspection?.importSessionId]);

  return (
    <div
      className={styles.timeline}
      ref={scrollArea}
      onScroll={(event) => {
        const area = event.currentTarget;
        follow.current =
          area.scrollHeight - area.scrollTop - area.clientHeight < 80;
        setAway(!follow.current);
      }}
    >
      <TimelineMessages messages={messages} />
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
                value={resolutions[suggestion.sourceValue] ?? undefined}
                onValueChange={(value) =>
                  setResolutions((current) => ({
                    ...current,
                    [suggestion.sourceValue]: value,
                  }))
                }
              >
                <SelectTrigger
                  aria-label={`材料 ${suggestion.sourceValue} 的身份决策`}
                >
                  <SelectValue placeholder="请选择" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={suggestion.targetMaterialId}>
                    链接 {suggestion.targetCode}
                  </SelectItem>
                  <SelectItem value="new">创建新材料</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
          {supported.length > 0 && (
            <Button
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
      {!messages.length && !inspection && (
        <WelcomeWorkspace onSuggestion={onSuggestion} />
      )}
      {away && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduced ? 0 : 0.15 }}
          className={styles.jump}
          onClick={() => {
            const area = scrollArea.current;
            if (area) {
              follow.current = true;
              area.scrollTop = area.scrollHeight;
              setAway(false);
            }
          }}
        >
          <ArrowDown size={14} />
          返回最新消息
        </motion.button>
      )}
    </div>
  );
}
