export function statusColor(status: string) {
  if (['succeeded', 'pass'].includes(status)) return 'success';
  if (['failed', 'fail', 'interrupted'].includes(status)) return 'error';
  if (['running', 'warn'].includes(status)) return 'processing';
  return 'default';
}
/*
 * 将工作区状态映射为统一的可视化色彩。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */
