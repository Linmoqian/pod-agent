/*
 * 将工作区状态映射为统一的可视化色彩语义。
 * 返回值作为 Badge 的 data-tone,状态色由 CSS Token(tokens.css)提供。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

export type StatusTone = 'success' | 'error' | 'processing' | 'default';

export function statusTone(status: string): StatusTone {
  if (['succeeded', 'pass'].includes(status)) return 'success';
  if (['failed', 'fail', 'interrupted'].includes(status)) return 'error';
  if (['running', 'warn'].includes(status)) return 'processing';
  return 'default';
}
