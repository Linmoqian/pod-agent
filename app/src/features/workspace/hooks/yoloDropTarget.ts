/* 根据原生拖放物理坐标定位图片识别卡片。
 * Created on 2026-09-14
 * @author: https://github.com/Linmoqian
 */
export function isYoloDropTarget(position: { x: number; y: number }) {
  const element = document.querySelector('[data-yolo-drop-target]');
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const x = position.x / scale;
  const y = position.y / scale;
  return rect.width > 0 && rect.height > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}
