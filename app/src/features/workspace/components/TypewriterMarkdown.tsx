/*
 * 首次进入时间线的 Agent 正文以低频逐字揭示，避免伪造流式数据。
 * Created on 2026-09-14
 * @author: https://github.com/Linmoqian
 */

import { useEffect, useState } from 'react';

import MarkdownContent from '../../../components/common/MarkdownContent';
import styles from './WorkspaceTimeline.module.css';

const REVEALED_MESSAGE_IDS = new Set<string>();
const CHARACTERS_PER_SECOND = 90;

function shouldReduceMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

type TypewriterMarkdownProps = {
  messageId: string;
  content: string;
  animate: boolean;
};

export default function TypewriterMarkdown({
  messageId,
  content,
  animate,
}: TypewriterMarkdownProps) {
  const alreadyRevealed = REVEALED_MESSAGE_IDS.has(messageId);
  const [visibleContent, setVisibleContent] = useState(
    alreadyRevealed || !animate || shouldReduceMotion() ? content : '',
  );
  const [typing, setTyping] = useState(
    Boolean(content) && animate && !alreadyRevealed && !shouldReduceMotion(),
  );

  useEffect(() => {
    if (
      !content ||
      !animate ||
      REVEALED_MESSAGE_IDS.has(messageId) ||
      shouldReduceMotion()
    ) {
      REVEALED_MESSAGE_IDS.add(messageId);
      setVisibleContent(content);
      setTyping(false);
      return;
    }
    let frameId = 0;
    let startAt: number | undefined;
    const reveal = (timestamp: number) => {
      startAt ??= timestamp;
      const characterCount = Math.min(
        content.length,
        Math.ceil(((timestamp - startAt) / 1000) * CHARACTERS_PER_SECOND),
      );
      setVisibleContent(content.slice(0, characterCount));
      if (characterCount < content.length) {
        frameId = window.requestAnimationFrame(reveal);
        return;
      }
      REVEALED_MESSAGE_IDS.add(messageId);
      setTyping(false);
    };
    frameId = window.requestAnimationFrame(reveal);
    return () => window.cancelAnimationFrame(frameId);
  }, [animate, content, messageId]);

  return (
    <div aria-busy={typing} aria-live="polite">
      <MarkdownContent content={visibleContent} />
      {typing && <span className={styles.typingCursor} aria-hidden />}
    </div>
  );
}
