// 开发人员模式下的工程终端面板。
// Created on 2026-09-16
// @author: https://github.com/Linmoqian

import { Terminal as TerminalIcon, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';

import { workspaceApi } from '../../../services/workspace';
import { isBrowserDebugRuntime } from '../../../services/runtime';
import type { TerminalRunResult } from '../types';
import styles from './TerminalPanel.module.css';

type TerminalEntry = {
  id: number;
  command: string;
  status: 'running' | 'done' | 'error';
  result?: TerminalRunResult;
  error?: string;
};

function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return '命令执行失败，请稍后重试。';
}

function TerminalEntryView({ entry }: { entry: TerminalEntry }) {
  const result = entry.result;
  return (
    <article className={styles.entry}>
      <div className={styles.commandLine}>
        <span className={styles.prompt} aria-hidden>
          $
        </span>
        <code>{entry.command}</code>
      </div>
      {entry.status === 'running' && (
        <div className={styles.running} role="status">
          执行中…
        </div>
      )}
      {entry.status === 'error' && (
        <div className={styles.errorOutput} role="alert">
          {entry.error}
        </div>
      )}
      {result && (
        <>
          {result.stdout && (
            <pre className={styles.stdout}>{result.stdout}</pre>
          )}
          {result.stderr && (
            <pre className={styles.stderr}>{result.stderr}</pre>
          )}
          {!result.stdout && !result.stderr && (
            <div
              className={result.success ? styles.success : styles.errorOutput}
            >
              {result.success ? '命令已完成，没有输出。' : '命令执行失败。'}
            </div>
          )}
          <div className={styles.entryMeta}>
            <span
              className={result.success ? styles.success : styles.errorOutput}
            >
              {result.success ? '完成' : `退出码 ${result.status ?? '未知'}`}
            </span>
            <span>{result.durationMs} ms</span>
            {result.truncated && <span>输出已截断</span>}
          </div>
        </>
      )}
    </article>
  );
}

export default function TerminalPanel({
  developerMode,
}: {
  developerMode: boolean;
}) {
  const [command, setCommand] = useState('');
  const [entries, setEntries] = useState<TerminalEntry[]>([]);
  const [running, setRunning] = useState(false);
  const sequence = useRef(0);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const output = outputRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [entries]);

  if (!developerMode) {
    return (
      <section
        className={styles.locked}
        aria-labelledby="terminal-locked-title"
      >
        <TerminalIcon size={22} aria-hidden />
        <h2 id="terminal-locked-title">终端已锁定</h2>
        <p>请在设置 → 工作模式中选择“开发人员”后使用。</p>
      </section>
    );
  }

  const runCommand = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = command.trim();
    if (!value || running) return;

    const id = ++sequence.current;
    setCommand('');
    setEntries((current) => [
      ...current,
      { id, command: value, status: 'running' },
    ]);
    setRunning(true);

    try {
      await workspaceApi.setTerminalAccess(developerMode);
      const result = await workspaceApi.runTerminalCommand(value);
      setEntries((current) =>
        current.map((entry) =>
          entry.id === id ? { ...entry, status: 'done', result } : entry,
        ),
      );
    } catch (error) {
      setEntries((current) =>
        current.map((entry) =>
          entry.id === id
            ? { ...entry, status: 'error', error: getErrorMessage(error) }
            : entry,
        ),
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="terminal-title">
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.icon} aria-hidden>
            <TerminalIcon size={17} />
          </span>
          <div>
            <h2 id="terminal-title">终端</h2>
            <p>开发人员模式 · 当前工程根目录</p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={styles.clearButton}
          onClick={() => setEntries([])}
          disabled={!entries.length || running}
        >
          <Trash2 size={14} aria-hidden />
          清空
        </Button>
      </header>

      <div
        ref={outputRef}
        className={styles.output}
        role="log"
        aria-live="polite"
        aria-label="终端输出"
      >
        {!entries.length && (
          <div className={styles.empty}>
            <TerminalIcon size={24} aria-hidden />
            <strong>从这里开始</strong>
            <span>
              {isBrowserDebugRuntime()
                ? '例如：git status（浏览器模拟）'
                : '例如：git status'}
            </span>
          </div>
        )}
        {entries.map((entry) => (
          <TerminalEntryView key={entry.id} entry={entry} />
        ))}
      </div>

      <form className={styles.composer} onSubmit={runCommand}>
        <label className={styles.commandInput}>
          <span className={styles.prompt} aria-hidden>
            $
          </span>
          <input
            aria-label="终端命令"
            autoComplete="off"
            spellCheck={false}
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="输入命令，例如 git status"
            disabled={running}
          />
        </label>
        <Button
          type="submit"
          className={styles.runButton}
          disabled={!command.trim() || running}
        >
          {running ? '执行中…' : '运行'}
        </Button>
      </form>
      <p className={styles.notice}>
        {isBrowserDebugRuntime()
          ? '浏览器调试模式：命令仅在内存中模拟，输出不会写入会话记录。'
          : '仅开发人员模式可用；命令在本机执行，输出不会写入会话记录。'}
      </p>
    </section>
  );
}
