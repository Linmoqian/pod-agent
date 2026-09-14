/*
 * 育种台的可管理视图标签栏与新增视图菜单。
 * Created on 2026-09-15
 * @author: https://github.com/Linmoqian
 */

import { CheckSquare, Folder, Plus, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import styles from './WorkbenchPanel.module.css';
import type { WorkbenchTab } from './useWorkbenchTabs';

type WorkbenchTabBarProps = {
  activeTabId: string;
  onAdd: (kind: WorkbenchTab['kind']) => void;
  onClose: (tabId: string) => void;
  onSelect: (tabId: string) => void;
  onToggleMenu: () => void;
  tabBarRef: React.RefObject<HTMLDivElement | null>;
  tabs: WorkbenchTab[];
  viewMenuOpen: boolean;
};

export default function WorkbenchTabBar({
  activeTabId,
  onAdd,
  onClose,
  onSelect,
  onToggleMenu,
  tabBarRef,
  tabs,
  viewMenuOpen,
}: WorkbenchTabBarProps) {
  const reduced = useReducedMotion();
  return (
    <div
      ref={tabBarRef}
      className={styles.tabBar}
      role="tablist"
      aria-label="育种台任务标签"
    >
      <div className={styles.tabList}>
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <motion.div
              key={tab.id}
              layout="position"
              className={styles.tab}
              data-active={active ? 'true' : undefined}
              transition={{
                type: 'spring',
                stiffness: 460,
                damping: 36,
                mass: 0.7,
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className={styles.tabLabel}
                onClick={() => onSelect(tab.id)}
              >
                <span>{tab.label}</span>
              </button>
              {!tab.pinned && (
                <button
                  type="button"
                  className={styles.closeTab}
                  aria-label={`关闭${tab.label}`}
                  onClick={() => onClose(tab.id)}
                >
                  <X size={13} />
                </button>
              )}
            </motion.div>
          );
        })}
      </div>
      <button
        type="button"
        className={styles.newTab}
        aria-label="新建育种台任务标签"
        title="新建任务标签"
        onClick={onToggleMenu}
        aria-haspopup="menu"
        aria-expanded={viewMenuOpen}
      >
        <Plus size={16} />
      </button>
      <AnimatePresence>
        {viewMenuOpen && (
          <motion.div
            className={styles.newTabMenu}
            role="menu"
            aria-label="新建育种台视图"
            initial={reduced ? false : { opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
          >
            <button type="button" role="menuitem" onClick={() => onAdd('task')}>
              <CheckSquare size={16} />
              <span>任务</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => onAdd('files')}
            >
              <Folder size={16} />
              <span>文件</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
