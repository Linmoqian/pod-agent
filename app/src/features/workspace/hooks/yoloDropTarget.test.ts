/* 验证 Finder 物理坐标与卡片拖放区域映射。
 * Created on 2026-09-14
 * @author: https://github.com/Linmoqian
 */
import { expect, test, vi } from 'vitest';
import { isYoloDropTarget } from './yoloDropTarget';

test('高分屏坐标转换，卡片内外分流', () => {
  const card = document.createElement('section');
  card.dataset.yoloDropTarget = '';
  document.body.append(card);
  vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 300, top: 50, bottom: 200, width: 200, height: 150 } as DOMRect);
  vi.stubGlobal('devicePixelRatio', 2);
  expect(isYoloDropTarget({ x: 400, y: 200 })).toBe(true);
  expect(isYoloDropTarget({ x: 100, y: 200 })).toBe(false);
  card.remove();
  expect(isYoloDropTarget({ x: 400, y: 200 })).toBe(false);
  vi.unstubAllGlobals();
});
