/*
 * 管理顶部工作区选项卡的排序与分组视图偏好。
 * Created on 2026-09-15
 * @author: https://github.com/Linmoqian
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { WorkspaceTab } from '../features/workspace/hooks/useWorkspaceController';

const STORAGE_KEY = 'lian.workspace-tab-layout.v1';

export const WORKSPACE_TAB_GROUP_COLORS = [
  { id: 'blue', label: '蓝色' },
  { id: 'pink', label: '粉色' },
  { id: 'purple', label: '紫色' },
  { id: 'violet', label: '靛紫' },
  { id: 'teal', label: '青色' },
  { id: 'cyan', label: '蓝绿色' },
  { id: 'orange', label: '橙色' },
  { id: 'yellow', label: '黄色' },
  { id: 'gray', label: '灰色' },
] as const;

export type WorkspaceTabGroupColor =
  (typeof WORKSPACE_TAB_GROUP_COLORS)[number]['id'];

export type WorkspaceTabGroup = {
  id: string;
  name: string;
  tabIds: string[];
  color: WorkspaceTabGroupColor;
};

type TabLayoutState = {
  order: string[];
  groupIds: Record<string, string>;
  groupNames: Record<string, string>;
  groupColors: Record<string, WorkspaceTabGroupColor>;
  labels: Record<string, string>;
};

const EMPTY_LAYOUT: TabLayoutState = {
  order: [],
  groupIds: {},
  groupNames: {},
  groupColors: {},
  labels: {},
};

function isWorkspaceTabGroupColor(value: unknown): value is WorkspaceTabGroupColor {
  return WORKSPACE_TAB_GROUP_COLORS.some((color) => color.id === value);
}

function readLayout(): TabLayoutState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_LAYOUT;
    const value = JSON.parse(raw) as Partial<TabLayoutState>;
    return {
      order: Array.isArray(value.order)
        ? value.order.filter((item): item is string => typeof item === 'string')
        : [],
      groupIds:
        value.groupIds && typeof value.groupIds === 'object'
          ? Object.fromEntries(
              Object.entries(value.groupIds).filter(
                ([tabId, groupId]) =>
                  typeof tabId === 'string' && typeof groupId === 'string',
              ),
            )
          : {},
      groupNames:
        value.groupNames && typeof value.groupNames === 'object'
          ? Object.fromEntries(
              Object.entries(value.groupNames).filter(
                ([groupId, name]) =>
                  typeof groupId === 'string' && typeof name === 'string',
              ),
            )
          : {},
      groupColors:
        value.groupColors && typeof value.groupColors === 'object'
          ? Object.fromEntries(
              Object.entries(value.groupColors).filter(([, color]) =>
                isWorkspaceTabGroupColor(color),
              ),
            )
          : {},
      labels:
        value.labels && typeof value.labels === 'object'
          ? Object.fromEntries(
              Object.entries(value.labels).filter(
                ([tabId, label]) =>
                  typeof tabId === 'string' && typeof label === 'string',
              ),
            )
          : {},
    };
  } catch {
    return EMPTY_LAYOUT;
  }
}

function nextGroupName(groupNames: Record<string, string>) {
  const usedNames = new Set(Object.values(groupNames));
  let index = 1;
  while (usedNames.has(`分组 ${index}`)) index += 1;
  return `分组 ${index}`;
}

function removeEmptyGroups(
  groupIds: Record<string, string>,
  groupNames: Record<string, string>,
  groupColors: Record<string, WorkspaceTabGroupColor>,
) {
  const counts = new Map<string, number>();
  Object.values(groupIds).forEach((groupId) => {
    counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
  });
  const nextGroupIds = { ...groupIds };
  const nextGroupNames = { ...groupNames };
  const nextGroupColors = { ...groupColors };
  for (const [tabId, groupId] of Object.entries(groupIds)) {
    if ((counts.get(groupId) ?? 0) < 2) delete nextGroupIds[tabId];
  }
  for (const groupId of Object.keys(groupNames)) {
    if (!Object.values(nextGroupIds).includes(groupId)) {
      delete nextGroupNames[groupId];
    }
  }
  for (const groupId of Object.keys(groupColors)) {
    if (!Object.values(nextGroupIds).includes(groupId)) {
      delete nextGroupColors[groupId];
    }
  }
  return {
    groupIds: nextGroupIds,
    groupNames: nextGroupNames,
    groupColors: nextGroupColors,
  };
}

function moveBefore(order: string[], sourceId: string, targetId: string) {
  const next = order.filter((tabId) => tabId !== sourceId);
  const targetIndex = next.indexOf(targetId);
  if (targetIndex < 0) return next;
  next.splice(targetIndex, 0, sourceId);
  return next;
}

export default function useWorkspaceTabLayout(tabs: WorkspaceTab[]) {
  const [layout, setLayout] = useState<TabLayoutState>(readLayout);
  const tabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);
  const tabIdSet = useMemo(() => new Set(tabIds), [tabIds]);
  const orderedTabs = useMemo(() => {
    const tabsById = new Map(tabs.map((tab) => [tab.id, tab]));
    const orderedIds = [
      ...layout.order.filter((tabId) => tabIdSet.has(tabId)),
      ...tabIds.filter((tabId) => !layout.order.includes(tabId)),
    ];
    return orderedIds
      .map((tabId) => {
        const tab = tabsById.get(tabId);
        if (!tab) return undefined;
        const label = layout.labels[tabId];
        return label ? { ...tab, label } : tab;
      })
      .filter((tab): tab is WorkspaceTab => Boolean(tab));
  }, [layout.labels, layout.order, tabIdSet, tabIds, tabs]);

  const groups = useMemo<WorkspaceTabGroup[]>(() => {
    const grouped = new Map<string, string[]>();
    for (const tab of orderedTabs) {
      const groupId = layout.groupIds[tab.id];
      if (!groupId) continue;
      grouped.set(groupId, [...(grouped.get(groupId) ?? []), tab.id]);
    }
    return [...grouped.entries()]
      .filter(([, groupTabIds]) => groupTabIds.length > 1)
      .map(([id, groupTabIds]) => ({
        id,
        name: layout.groupNames[id] ?? '分组',
        tabIds: groupTabIds,
        color: layout.groupColors[id] ?? 'blue',
      }));
  }, [layout.groupColors, layout.groupIds, layout.groupNames, orderedTabs]);

  useEffect(() => {
    setLayout((current) => {
      const order = current.order.filter((tabId) => tabIdSet.has(tabId));
      const groupIds = Object.fromEntries(
        Object.entries(current.groupIds).filter(([tabId]) => tabIdSet.has(tabId)),
      );
      const labels = Object.fromEntries(
        Object.entries(current.labels).filter(([tabId]) => tabIdSet.has(tabId)),
      );
      const groupColors = Object.fromEntries(
        Object.entries(current.groupColors).filter(([groupId]) =>
          Object.values(groupIds).includes(groupId),
        ),
      );
      const cleaned = removeEmptyGroups(groupIds, current.groupNames, groupColors);
      const unchanged =
        order.length === current.order.length &&
        Object.keys(cleaned.groupIds).length === Object.keys(current.groupIds).length &&
        Object.keys(cleaned.groupNames).length === Object.keys(current.groupNames).length &&
        Object.keys(cleaned.groupColors).length === Object.keys(current.groupColors).length &&
        Object.keys(labels).length === Object.keys(current.labels).length;
      return unchanged
        ? current
        : {
            order,
            groupIds: cleaned.groupIds,
            groupNames: cleaned.groupNames,
            groupColors: cleaned.groupColors,
            labels,
          };
    });
  }, [tabIdSet]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // 本地偏好不可用时不影响当前窗口内的排序与分组。
    }
  }, [layout]);

  const moveTabBefore = useCallback((sourceId: string, targetId: string) => {
    setLayout((current) => ({
      ...current,
      order: moveBefore(
        [
          ...current.order,
          ...tabIds.filter((tabId) => !current.order.includes(tabId)),
        ],
        sourceId,
        targetId,
      ),
    }));
  }, [tabIds]);

  const setTabGroup = useCallback(
    (tabId: string, groupId: string | null) => {
      setLayout((current) => {
        const groupIds = { ...current.groupIds };
        if (groupId) groupIds[tabId] = groupId;
        else delete groupIds[tabId];
        const cleaned = removeEmptyGroups(
          groupIds,
          current.groupNames,
          current.groupColors,
        );
        return { ...current, ...cleaned };
      });
    },
    [],
  );

  const groupTabWith = useCallback(
    (sourceId: string, targetId: string) => {
      setLayout((current) => {
        const existingGroupId = current.groupIds[targetId];
        const groupId = existingGroupId ?? `tab-group-${Date.now()}`;
        const groupIds = {
          ...current.groupIds,
          [sourceId]: groupId,
          [targetId]: groupId,
        };
        const groupNames = existingGroupId
          ? current.groupNames
          : { ...current.groupNames, [groupId]: nextGroupName(current.groupNames) };
        const groupColors = existingGroupId
          ? current.groupColors
          : { ...current.groupColors, [groupId]: 'blue' as const };
        const cleaned = removeEmptyGroups(groupIds, groupNames, groupColors);
        return {
          ...current,
          order: moveBefore(
            [
              ...current.order,
              ...tabIds.filter((tabId) => !current.order.includes(tabId)),
            ],
            sourceId,
            targetId,
          ),
          ...cleaned,
        };
      });
    },
    [tabIds],
  );

  const moveTabToGroup = useCallback(
    (tabId: string, groupId: string) => {
      setLayout((current) => {
        if (!current.groupNames[groupId]) return current;
        const groupIds = { ...current.groupIds, [tabId]: groupId };
        const cleaned = removeEmptyGroups(
          groupIds,
          current.groupNames,
          current.groupColors,
        );
        return { ...current, ...cleaned };
      });
    },
    [],
  );

  const ungroupTab = useCallback((tabId: string) => {
    setTabGroup(tabId, null);
  }, [setTabGroup]);

  const renameTab = useCallback((tabId: string, name: string) => {
    setLayout((current) => {
      const labels = { ...current.labels };
      const trimmed = name.trim();
      if (trimmed) labels[tabId] = trimmed;
      else delete labels[tabId];
      return { ...current, labels };
    });
  }, []);

  const renameGroup = useCallback((groupId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLayout((current) => ({
      ...current,
      groupNames: { ...current.groupNames, [groupId]: trimmed },
    }));
  }, []);

  const setGroupColor = useCallback(
    (groupId: string, color: WorkspaceTabGroupColor) => {
      setLayout((current) => ({
        ...current,
        groupColors: { ...current.groupColors, [groupId]: color },
      }));
    },
    [],
  );

  const ungroupGroup = useCallback((groupId: string) => {
    setLayout((current) => {
      const groupIds = Object.fromEntries(
        Object.entries(current.groupIds).filter(([, value]) => value !== groupId),
      );
      const cleaned = removeEmptyGroups(
        groupIds,
        current.groupNames,
        current.groupColors,
      );
      return { ...current, ...cleaned };
    });
  }, []);

  return {
    groups,
    groupIds: layout.groupIds,
    moveTabBefore,
    moveTabToGroup,
    orderedTabs,
    groupTabWith,
    renameGroup,
    renameTab,
    setGroupColor,
    setTabGroup,
    ungroupGroup,
    ungroupTab,
  };
}
