/*
 * 管理育种台的常驻任务标签与可关闭的辅助视图标签。
 * Created on 2026-09-15
 * @author: https://github.com/Linmoqian
 */

import { useEffect, useRef, useState } from 'react';

import type { TaskPlan } from '../types';

export type WorkbenchTabKind = 'task' | 'files';

export type WorkbenchTab = {
  id: string;
  label: string;
  kind: WorkbenchTabKind;
  pinned?: boolean;
};

export default function useWorkbenchTabs(latestPlan?: TaskPlan) {
  const [tabs, setTabs] = useState<WorkbenchTab[]>([
    { id: 'task', label: '任务', kind: 'task', pinned: true },
  ]);
  const [activeTabId, setActiveTabId] = useState('task');
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const tabBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewMenuOpen) return;
    const close = (event: MouseEvent) => {
      if (!tabBarRef.current?.contains(event.target as Node)) {
        setViewMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewMenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [viewMenuOpen]);

  const addTab = (kind: WorkbenchTabKind) => {
    const id = `${kind}-${Date.now()}`;
    setTabs((current) => [
      ...current,
      {
        id,
        kind,
        label:
          kind === 'files'
            ? '文件'
            : latestPlan?.title || `任务 ${current.length}`,
      },
    ]);
    setActiveTabId(id);
    setViewMenuOpen(false);
  };
  const closeTab = (tabId: string) => {
    const index = tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0 || tabs[index].pinned) return;
    const next = tabs.filter((tab) => tab.id !== tabId);
    setTabs(next);
    if (tabId === activeTabId) {
      setActiveTabId(next[index]?.id ?? next[index - 1]?.id ?? 'task');
    }
  };

  return {
    activeTabId,
    addTab,
    closeTab,
    setActiveTabId,
    setViewMenuOpen,
    tabBarRef,
    tabs,
    viewMenuOpen,
  };
}
