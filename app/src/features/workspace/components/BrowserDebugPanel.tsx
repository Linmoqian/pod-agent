/* 浏览器调试运行时的场景、推理控制与事件日志面板。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import { useEffect, useState } from 'react';
import {
  Bug,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Pause,
  Play,
  RotateCcw,
  StepForward,
  Trash2,
} from 'lucide-react';

import { getFrontendRuntime } from '../../../services/runtime';
import type {
  BrowserDebugScenario,
  BrowserDebugState,
} from '../../../services/runtime';
import styles from './BrowserDebugPanel.module.css';

const EMPTY_STATE: BrowserDebugState = {
  paused: false,
  queued: 0,
  running: 0,
  completed: 0,
  failed: 0,
  eventLog: [],
};

const SCENARIOS: Array<{ id: BrowserDebugScenario; label: string }> = [
  { id: 'blank', label: '空白会话' },
  { id: 'workspace', label: '项目与文件' },
  { id: 'agent', label: 'Agent 任务' },
  { id: 'yolo', label: 'YOLO 8 张' },
  { id: 'full', label: '全流程' },
];

export default function BrowserDebugPanel() {
  const runtime = getFrontendRuntime();
  const debug = runtime.debug;
  const [expanded, setExpanded] = useState(true);
  const [state, setState] = useState<BrowserDebugState>(
    () => debug?.getState() ?? EMPTY_STATE,
  );

  useEffect(() => {
    if (!debug) return undefined;
    setState(debug.getState());
    return debug.subscribe(() => setState(debug.getState()));
  }, [debug]);

  if (runtime.mode !== 'browser-debug' || !debug) return null;

  const runScenario = (scenario: BrowserDebugScenario) => {
    debug.loadScenario(scenario);
    setExpanded(true);
  };

  return (
    <aside className={styles.panel} aria-label="浏览器调试控制">
      <header className={styles.header}>
        <div className={styles.title}>
          <Bug size={15} aria-hidden />
          <strong>浏览器调试</strong>
          <span>内存模拟</span>
        </div>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={expanded ? '收起浏览器调试面板' : '展开浏览器调试面板'}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
      </header>
      {expanded && (
        <div className={styles.body}>
          <p className={styles.notice}>
            不访问本机文件、不执行终端命令；刷新页面会重置。
          </p>
          <section className={styles.section} aria-labelledby="debug-scenes">
            <h2 id="debug-scenes">场景</h2>
            <div className={styles.scenarios}>
              {SCENARIOS.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  className={scenario.id === 'full' ? styles.primaryButton : styles.button}
                  onClick={() => runScenario(scenario.id)}
                >
                  {scenario.label}
                </button>
              ))}
            </div>
          </section>
          <section className={styles.section} aria-labelledby="debug-inference">
            <h2 id="debug-inference">推理控制 · Batch=8</h2>
            <div className={styles.controls}>
              <button
                type="button"
                className={styles.button}
                onClick={() => debug.setInferencePaused(!state.paused)}
              >
                {state.paused ? <Play size={13} /> : <Pause size={13} />}
                {state.paused ? '继续' : '暂停'}
              </button>
              <button type="button" className={styles.button} onClick={() => debug.stepInference(1)}>
                <StepForward size={13} />单步 1
              </button>
              <button type="button" className={styles.button} onClick={() => debug.stepInference(8)}>
                <StepForward size={13} />推进 8
              </button>
              <button type="button" className={styles.button} onClick={debug.failNextInference}>
                <CircleAlert size={13} />失败下一张
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={debug.retryFailedInference}
                disabled={state.failed === 0}
              >
                <RotateCcw size={13} />重试失败
              </button>
            </div>
            <div className={styles.stats} aria-live="polite">
              <span>等待 {state.queued}</span>
              <span>运行 {state.running}</span>
              <span>完成 {state.completed}</span>
              <span>失败 {state.failed}</span>
            </div>
          </section>
          <footer className={styles.footer}>
            <button type="button" className={styles.textButton} onClick={debug.reset}>
              <RotateCcw size={13} />重置
            </button>
            <button
              type="button"
              className={styles.textButton}
              onClick={debug.clearLog}
            >
              <Trash2 size={13} />清空日志
            </button>
          </footer>
          {!!state.eventLog.length && (
            <ol className={styles.log} aria-label="调试事件日志">
              {state.eventLog.slice(0, 6).map((entry, index) => (
                <li key={`${entry}-${index}`}>{entry}</li>
              ))}
            </ol>
          )}
        </div>
      )}
    </aside>
  );
}
