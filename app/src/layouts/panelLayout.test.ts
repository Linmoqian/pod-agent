/* 育种台布局偏好读取、补全和损坏数据回退测试。
 * Created on 2026-09-17
 * @author: https://github.com/Linmoqian
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_PANEL_LAYOUT,
  PANEL_LAYOUT_STORAGE_KEY,
  readPanelLayout,
} from './panelLayout';

beforeEach(() => {
  window.localStorage.clear();
});

describe('panelLayout', () => {
  it('为旧布局补齐模块顺序和复杂样式默认值', () => {
    window.localStorage.setItem(
      PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        reversed: false,
        navigation: 248,
        workbench: 320,
        showImageRecognition: true,
        showFileTree: true,
        showResourceMonitor: true,
      }),
    );

    expect(readPanelLayout()).toMatchObject({
      workbenchOrder: DEFAULT_PANEL_LAYOUT.workbenchOrder,
      imageRecognitionDensity: 'complex',
      resourceMonitorDensity: 'complex',
    });
  });

  it('清理非法和重复模块并补齐缺失模块', () => {
    window.localStorage.setItem(
      PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        reversed: false,
        navigation: 248,
        workbench: 320,
        workbenchOrder: ['taskPanel', 'taskPanel', 'unknown', 'resourceMonitor'],
        imageRecognitionDensity: 'simple',
        resourceMonitorDensity: 'invalid',
      }),
    );

    expect(readPanelLayout().workbenchOrder).toEqual([
      'taskPanel',
      'resourceMonitor',
      'imageRecognition',
    ]);
    expect(readPanelLayout().imageRecognitionDensity).toBe('simple');
    expect(readPanelLayout().resourceMonitorDensity).toBe('complex');
  });

  it('损坏的布局安全回退到默认值', () => {
    window.localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, '{bad');
    expect(readPanelLayout()).toEqual(DEFAULT_PANEL_LAYOUT);
  });
});
