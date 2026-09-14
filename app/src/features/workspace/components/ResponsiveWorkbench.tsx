/*
 * 触屏端将育种台转为可收起的底部面板，保持上下文始终可达。
 * Created on 2026-09-13
 * Updated on 2026-09-14
 * @author: https://github.com/Linmoqian
 */

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useState } from 'react';

import WorkbenchPanel, { type WorkbenchPanelProps } from './WorkbenchPanel';
import styles from './ResponsiveWorkbench.module.css';

const COMPACT_QUERY = '(pointer: coarse) and (max-width: 1024px)';

type ResponsiveWorkbenchProps = WorkbenchPanelProps & {
  open: boolean;
  onToggle: () => void;
};

function useCompactWorkbench() {
  const [compact, setCompact] = useState(
    () => window.matchMedia(COMPACT_QUERY).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(COMPACT_QUERY);
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return compact;
}

function PanelContent({ embedded, ...props }: WorkbenchPanelProps) {
  return <WorkbenchPanel {...props} embedded={embedded} />;
}

export default function ResponsiveWorkbench({
  open,
  onToggle,
  ...panelProps
}: ResponsiveWorkbenchProps) {
  const compact = useCompactWorkbench();

  if (!compact) {
    return open ? <PanelContent {...panelProps} /> : null;
  }

  return (
    <aside
      className={styles.sheet}
      data-expanded={open}
      aria-label="育种台"
    >
      <button
        type="button"
        className={styles.sheetToggle}
        aria-label={open ? '收起育种台' : '展开育种台'}
        aria-expanded={open}
        onClick={onToggle}
      >
        {open ? (
          <ChevronDown size={18} strokeWidth={1.75} />
        ) : (
          <ChevronUp size={18} strokeWidth={1.75} />
        )}
      </button>
      <div className={styles.sheetBody}>
        <PanelContent {...panelProps} embedded />
      </div>
    </aside>
  );
}
