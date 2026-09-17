/* 计算机资源监视卡：展示桌面端 CPU 与内存的实时使用情况。
 * Created on 2026-09-17
 * Updated on 2026-09-17
 * @author: https://github.com/Linmoqian
 */

import { Activity, Cpu, MemoryStick, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  getFrontendRuntime,
  isBrowserPreviewRuntime,
  type RuntimeResourceSnapshot,
} from '../../../services/runtime';
import type { WorkbenchModuleDensity } from '../../../layouts/panelLayout';
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

export default function SystemResourceCard({
  density = 'complex',
  onClose,
}: {
  density?: WorkbenchModuleDensity;
  onClose?: () => void;
}) {
  const { snapshot, status } = useSystemResources();
  const cpuPercent = clampPercent(snapshot?.cpuPercent ?? 0);
  const memoryPercent = clampPercent(snapshot?.memoryPercent ?? 0);

  return (
    <section className={styles.card} data-density={density} aria-label="计算机资源监视">
      <header>
        <strong>
          <Activity size={15} aria-hidden />
          计算机资源
        </strong>
        {onClose && <button type="button" className={styles.closeButton} title="关闭计算机资源模块" aria-label="关闭计算机资源模块" onClick={onClose}><X size={14} aria-hidden /></button>}
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
                : `${formatPercent(memoryPercent)}${density === 'complex' && snapshot ? ` · ${formatMemory(snapshot.usedMemoryBytes)} / ${formatMemory(snapshot.totalMemoryBytes)}` : ''}`}
            </strong>
          </div>
          <div className={styles.track} data-tone={resourceTone(memoryPercent)} aria-hidden>
            <span style={{ width: `${memoryPercent}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}
