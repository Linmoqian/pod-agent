/* 桌面端资源快照轮询：资源监视卡与育种台紧凑 rail 共用。
 * Created on 2026-09-30
 * @author: https://github.com/Linmoqian
 */

import { useEffect, useState } from 'react';

import {
  getFrontendRuntime,
  isBrowserPreviewRuntime,
  type RuntimeResourceSnapshot,
} from '../../../services/runtime';

const RESOURCE_REFRESH_INTERVAL_MS = 1500;

export type ResourceStatus = 'loading' | 'ready' | 'preview' | 'error';

export function useSystemResources() {
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
