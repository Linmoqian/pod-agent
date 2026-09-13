/*
 * 按窗口宽度在常驻育种台与可访问抽屉之间切换。
 * Created on 2026-09-13
 * @author: https://github.com/Linmoqian
 */

import { Drawer } from 'antd';
import { useEffect, useState } from 'react';

import WorkbenchPanel, { type WorkbenchPanelProps } from './WorkbenchPanel';
import styles from './ResponsiveWorkbench.module.css';

const COMPACT_QUERY = '(max-width: 980px)';

type ResponsiveWorkbenchProps = WorkbenchPanelProps & {
  open: boolean;
  onClose: () => void;
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
  onClose,
  ...panelProps
}: ResponsiveWorkbenchProps) {
  const compact = useCompactWorkbench();

  if (!compact) {
    return open ? <PanelContent {...panelProps} /> : null;
  }

  return (
    <Drawer
      title="育种台"
      placement="right"
      open={open}
      onClose={onClose}
      destroyOnHidden
      rootClassName={styles.drawerRoot}
    >
      {open && <PanelContent {...panelProps} embedded />}
    </Drawer>
  );
}
