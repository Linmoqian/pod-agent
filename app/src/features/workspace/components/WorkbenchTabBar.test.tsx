/* 验证育种台加号菜单中的视图与模块入口。Created on 2026-09-17 @author: https://github.com/Linmoqian */
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import WorkbenchTabBar from './WorkbenchTabBar';
import type { WorkbenchTab } from './useWorkbenchTabs';

const tabs: WorkbenchTab[] = [
  { id: 'task', label: '任务', kind: 'task', pinned: true },
];

function renderMenu(
  moduleVisibility = { imageRecognition: false, resourceMonitor: false },
) {
  const onAddModule = vi.fn();
  const onToggleMenu = vi.fn();
  render(
    <WorkbenchTabBar
      activeTabId="task"
      onAdd={vi.fn()}
      onClose={vi.fn()}
      onSelect={vi.fn()}
      onToggleMenu={onToggleMenu}
      tabBarRef={createRef<HTMLDivElement>()}
      tabs={tabs}
      viewMenuOpen
      onAddModule={onAddModule}
      moduleVisibility={moduleVisibility}
    />,
  );
  return { onAddModule, onToggleMenu };
}

it('加号菜单提供图片识别和计算机资源模块', () => {
  const { onAddModule, onToggleMenu } = renderMenu();

  fireEvent.click(screen.getByRole('menuitem', { name: '图片识别模块' }));

  expect(onAddModule).toHaveBeenCalledWith('imageRecognition');
  expect(onToggleMenu).toHaveBeenCalledTimes(1);
});

it('已经显示的模块不可重复添加', () => {
  renderMenu({ imageRecognition: true, resourceMonitor: false });

  expect(
    screen.getByRole('menuitem', { name: '图片识别模块（已添加）' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('menuitem', { name: '计算机资源模块' }),
  ).toBeEnabled();
});
