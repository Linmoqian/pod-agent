/* 计算机资源监视卡：展示桌面端 CPU 与内存的实时使用情况。
 * Created on 2026-09-17
 * @author: https://github.com/Linmoqian
 */

import { Activity, CircleAlert, CircleCheck, Cpu, MemoryStick } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  getFrontendRuntime,
  isBrowserPreviewRuntime,
  type RuntimeResourceSnapshot,
} from '../../../services/runtime';
import styles from './SystemResourceCard.module.css';

const RESOURCE_REFRESH_INTERVAL_MS = 1500;

type ResourceStatus = 'loading' | 'ready' | 'preview' | 'error';

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function formatPercent(value: number) {
  return `${Math.round(clampPercent(value))}%`;
}

function formatMemory(bytes: number) {
  const gigabytes = bytes / 1024 ** 3;
  return `${gigabytes.toFixed(1)} GB`;
}

function resourceTone(value: number) {
  if (value >= 85) return 'danger';
  if (value >= 65) return 'warning';
  return 'normal';
}

function useSystemResources() {
  const runtime = getFrontendRuntime();
  const [snapshot, setSnapshot] = useState<RuntimeResourceSnapshot | null>(null);
  const [status, setStatus] = useState<ResourceStatus>(
    isBrowserPreviewRuntime() ? 'preview' : 'loading',
  );

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;

    if (runtime.mode === 'browser-preview') {
      setStatus('preview');
      return () => {
        disposed = true;
      };
    }

    const read = async () => {
      try {
        const next = await runtime.invoke<RuntimeResourceSnapshot>('system_resources');
        if (disposed) return;
        setSnapshot(next);
        setStatus('ready');
      } catch {
        if (disposed) return;
        setStatus('error');
      } finally {
        if (!disposed) {
          timer = window.setTimeout(read, RESOURCE_REFRESH_INTERVAL_MS);
        }
      }
    };

    void read();
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [runtime]);

  return { snapshot, status };
}

function statusText(status: ResourceStatus) {
  if (status === 'loading') return '读取中';
  if (status === 'preview') return '桌面端可用';
  if (status === 'error') return '暂不可用';
  return '监视中';
}

export default function SystemResourceCard() {
  const { snapshot, status } = useSystemResources();
  const cpuPercent = clampPercent(snapshot?.cpuPercent ?? 0);
  const memoryPercent = clampPercent(snapshot?.memoryPercent ?? 0);
  const StatusIcon = status === 'error' ? CircleAlert : status === 'ready' ? CircleCheck : Activity;

  return (
    <section className={styles.card} aria-label="计算机资源监视">
      <header>
        <strong>
          <Activity size={15} aria-hidden />
          计算机资源
        </strong>
        <span className={styles.status} data-status={status}>
          <StatusIcon size={13} aria-hidden />
          {statusText(status)}
        </span>
      </header>
      <div className={styles.metrics}>
        <div className={styles.metric}>
          <div className={styles.metricHeader}>
            <span>
              <Cpu size={14} aria-hidden />
              CPU
            </span>
            <strong>{status === 'preview' ? '—' : formatPercent(cpuPercent)}</strong>
          </div>
          <div className={styles.track} data-tone={resourceTone(cpuPercent)} aria-hidden>
            <span style={{ width: `${cpuPercent}%` }} />
          </div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricHeader}>
            <span>
              <MemoryStick size={14} aria-hidden />
              内存
            </span>
            <strong>
              {status === 'preview'
                ? '—'
                : `${formatPercent(memoryPercent)}${snapshot ? ` · ${formatMemory(snapshot.usedMemoryBytes)} / ${formatMemory(snapshot.totalMemoryBytes)}` : ''}`}
            </strong>
          </div>
          <div className={styles.track} data-tone={resourceTone(memoryPercent)} aria-hidden>
            <span style={{ width: `${memoryPercent}%` }} />
          </div>
        </div>
      </div>
      <footer>
        <span>仅采集系统概览，不影响推理任务。</span>
        <span>{status === 'ready' ? '每 1.5 秒更新' : '等待数据'}</span>
      </footer>
    </section>
  );
}
