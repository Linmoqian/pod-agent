/*
 * 展示 Project 内消息时间线与待确认的数据识别结果。
 * Created on 2026-09-12
 * Updated on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import {
  ArrowDown,
  ArrowUpRight,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  LoaderCircle,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import agentMascot from '../../../assets/agent-mascot.png';
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
  onRetry: (content: string) => void;
};

function WelcomeWorkspace({
  onSuggestion,
}: {
  onSuggestion?: (value: string) => void;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div className={styles.welcome} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
      <motion.div
        className={styles.welcomeMascotFloat}
        animate={reduced ? undefined : { y: [0, -6, 0], scale: [1, 1.025, 1] }}
        transition={{ duration: 3.2, ease: 'easeInOut', repeat: Infinity }}
      >
        <motion.button
          type="button"
          className={styles.welcomeMascotButton}
          aria-label="lian Agent 吉祥物"
          onPointerDown={(event) => event.stopPropagation()}
          whileTap={{ scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 460, damping: 24 }}
        >
          <img
            className={styles.welcomeMascot}
            src={agentMascot}
            alt=""
          />
        </motion.button>
      </motion.div>
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
      <small className={styles.welcomeTip}>Ctrl+S 保存临时会话为项目会话。</small>
    </motion.div>
  );
}

function ReasoningBlock({ reasoning }: { reasoning?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const reduced = useReducedMotion();
  if (!reasoning?.trim()) return null;
  return (
    <section className={styles.reasoning}>
      <motion.button
        type="button"
        className={styles.reasoningToggle}
        aria-expanded={expanded}
        whileTap={{ scale: 0.98 }}
        onClick={() => setExpanded((value) => !value)}
      >
        <BrainCircuit size={15} strokeWidth={1.75} aria-hidden />
        <span>模型思考</span>
        {expanded ? (
          <ChevronUp size={15} strokeWidth={1.75} aria-hidden />
        ) : (
          <ChevronDown size={15} strokeWidth={1.75} aria-hidden />
        )}
      </motion.button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className={styles.reasoningContent}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={
              reduced
                ? { duration: 0 }
                : { type: 'spring', stiffness: 420, damping: 38, mass: 0.8 }
            }
          >
            <MarkdownContent content={reasoning} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function supportedCandidates(inspection: ImportInspection | null) {
  return (
    inspection?.candidates.filter((candidate) => candidate.supported) ?? []
  );
}

function scrollToLatest(area: HTMLDivElement, behavior: ScrollBehavior) {
  if (typeof area.scrollTo === 'function') {
    area.scrollTo({ top: area.scrollHeight, behavior });
  } else {
    area.scrollTop = area.scrollHeight;
  }
}

function PendingReply() {
  const reduced = useReducedMotion();
  return (
    <div className={styles.pendingReply} role="status">
      <motion.span
        className={styles.pendingDot}
        aria-hidden
        animate={reduced ? undefined : { opacity: [0.45, 1, 0.45], scale: [0.82, 1, 0.82] }}
        transition={{ duration: 1.2, ease: 'easeInOut', repeat: Infinity }}
      />
      <LoaderCircle size={15} aria-hidden />
      正在生成回复
    </div>
  );
}

function StreamingReply({ content }: { content: string }) {
  const reduced = useReducedMotion();
  return (
    <div className={styles.streamingReply} aria-busy="true">
      <span className={styles.streamStatus} role="status">正在生成回复</span>
      {content ? <MarkdownContent content={content} /> : null}
      <motion.span
        className={styles.typingCursor}
        aria-hidden
        animate={reduced ? undefined : { opacity: [1, 1, 0, 0, 1] }}
        transition={{ duration: 0.9, times: [0, 0.48, 0.5, 0.98, 1], repeat: Infinity }}
      />
    </div>
  );
}

function TimelineMessages({
  messages,
  onRetry,
}: Pick<WorkspaceTimelineProps, 'messages' | 'onRetry'>) {
  return messages.map((item) => (
    <div key={item.id} className={styles.message} data-role={item.role}>
      {item.role === 'user' ? (
        <p>{item.content}</p>
      ) : item.status === 'pending' ? (
        <PendingReply />
      ) : item.status === 'streaming' ? (
        <>
          <ReasoningBlock reasoning={item.reasoning} />
          <StreamingReply content={item.content} />
        </>
      ) : item.status === 'error' ? (
        <div className={styles.replyError} role="alert">
          <p>{item.errorMessage || '回复生成失败'}</p>
          {item.retryContent && (
            <Button size="sm" variant="outline" onClick={() => onRetry(item.retryContent!)}>
              重新发送
            </Button>
          )}
        </div>
      ) : (
        <>
          <ReasoningBlock reasoning={item.reasoning} />
          <MarkdownContent content={item.content} />
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
  onRetry,
  onSuggestion,
}: WorkspaceTimelineProps) {
  const scrollArea = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const smoothScrolling = useRef(false);
  const [away, setAway] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    const area = scrollArea.current;
    if (area && follow.current) {
      scrollToLatest(area, smoothScrolling.current ? 'smooth' : 'auto');
    }
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
        const atLatest =
          area.scrollHeight - area.scrollTop - area.clientHeight < 80;
        if (smoothScrolling.current && !atLatest) return;
        smoothScrolling.current = false;
        follow.current = atLatest;
        setAway(!atLatest);
      }}
      onWheel={() => {
        smoothScrolling.current = false;
      }}
      onTouchMove={() => {
        smoothScrolling.current = false;
      }}
      onPointerDown={(event) => {
        smoothScrolling.current = false;
        if ((event.target as HTMLElement).closest('button, a, input, textarea, select, pre, code')) {
          follow.current = false;
          setAway(true);
        }
      }}
    >
      <TimelineMessages messages={messages} onRetry={onRetry} />
      {inspection && (
        <section className={styles.inspection}>
          <h3><Database size={16} aria-hidden />数据识别</h3>
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
              const isStreaming = messages.some(
                (item) => item.status === 'pending' || item.status === 'streaming',
              );
              const behavior = reduced || isStreaming ? 'auto' : 'smooth';
              smoothScrolling.current =
                behavior === 'smooth' && typeof area.scrollTo === 'function';
              follow.current = true;
              scrollToLatest(area, behavior);
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
