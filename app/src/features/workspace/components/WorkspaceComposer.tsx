/*
 * 统一承载研究问题、文件选择与文件夹选择的输入器。
 * Created on 2026-09-12
 * Updated on 2026-09-13
 * @author: https://github.com/Linmoqian
 */

import { Plus, ArrowUp, Loader2, X, FileUp, FolderOpen, Database, Keyboard } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import styles from './WorkspaceComposer.module.css';

type WorkspaceComposerProps = {
  intent: string;
  busy: boolean;
  onIntentChange: (value: string) => void;
  onChooseData: (directory: boolean) => void;
  onSubmit: () => void;
};

export default function WorkspaceComposer({
  intent,
  busy,
  onIntentChange,
  onChooseData,
  onSubmit,
}: WorkspaceComposerProps) {
  const canSubmit = Boolean(intent.trim()) && !busy;
  const input = useRef<HTMLTextAreaElement>(null);
  const [guidanceVisible, setGuidanceVisible] = useState(true);
  useLayoutEffect(() => {
    if (!input.current) return;
    input.current.style.height = 'auto';
    input.current.style.height = `${input.current.scrollHeight}px`;
  }, [intent]);

  return (
    <motion.div
      className={styles.composer}
      layout
      transition={{ layout: { type: 'spring', stiffness: 420, damping: 38, mass: 0.8 } }}
    >
      <textarea
        ref={input}
        aria-label="研究问题"
        aria-describedby={busy ? 'workspace-composer-status' : undefined}
        maxLength={4000}
        value={intent}
        rows={2}
        onChange={(event) => {
          onIntentChange(event.target.value);
          if (event.target.value) setGuidanceVisible(false);
        }}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            if (canSubmit) onSubmit();
          }
        }}
        placeholder="描述一个研究问题，或告诉 lian 你想完成什么……"
      />
      {intent && !busy && <button className={styles.clear} aria-label="清空输入" title="清空输入" onClick={() => onIntentChange('')}><X size={15} /></button>}
      <div className={styles.actions}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={styles.dataButton}
              disabled={busy}
            >
              <Plus size={15} strokeWidth={1.75} />
              添加数据
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className={styles.dataMenu} align="start" sideOffset={8}>
            <DropdownMenuItem className={styles.dataItem} onSelect={() => onChooseData(false)}>
              <span className={styles.dataIcon}><FileUp size={17} /></span>
              <span className={styles.dataCopy}><strong>本地文件</strong><small>CSV、Excel 或文本数据</small></span>
            </DropdownMenuItem>
            <DropdownMenuItem className={styles.dataItem} onSelect={() => onChooseData(true)}>
              <span className={styles.dataIcon}><FolderOpen size={17} /></span>
              <span className={styles.dataCopy}><strong>本地文件夹</strong><small>批量导入一个目录</small></span>
            </DropdownMenuItem>
            <DropdownMenuItem className={styles.dataItem} disabled>
              <span className={styles.dataIcon}><Database size={17} /></span>
              <span className={styles.dataCopy}><strong>连接数据源</strong><small>V1 暂未开放</small></span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className={styles.meta}>
          {busy ? (
            <span className={styles.status} id="workspace-composer-status" aria-live="polite">
              lian 正在整理思路…
            </span>
          ) : (
            <>
              <span className={styles.counter}>{intent.length}/4000</span>
              <AnimatePresence initial={false}>
                {guidanceVisible && (
                  <motion.span
                    className={styles.guidance}
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                  >
                    <span>Enter 发送 · Shift + Enter 换行</span>
                    <button
                      type="button"
                      className={styles.hideGuidance}
                      aria-label="隐藏输入提示"
                      title="隐藏输入提示"
                      onClick={() => setGuidanceVisible(false)}
                    >
                      <X size={12} />
                    </button>
                  </motion.span>
                )}
              </AnimatePresence>
              {!guidanceVisible && (
                <button
                  type="button"
                  className={styles.showGuidance}
                  aria-label="显示输入提示"
                  title="显示输入提示"
                  onClick={() => setGuidanceVisible(true)}
                >
                  <Keyboard size={14} />
                </button>
              )}
            </>
          )}
        </div>
        <button
          aria-label="提交研究问题"
          className={styles.send}
          onClick={onSubmit}
          disabled={!canSubmit}
        >
          {busy ? (
            <motion.span
              aria-hidden
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, ease: 'linear', repeat: Infinity }}
            >
              <Loader2 size={16} />
            </motion.span>
          ) : (
            <ArrowUp size={17} strokeWidth={2} />
          )}
        </button>
      </div>
    </motion.div>
  );
}
