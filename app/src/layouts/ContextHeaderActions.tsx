/*
 * 工作区头部的开发工具入口。
 * Created on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import { Terminal } from 'lucide-react';

import { Button } from '@/components/ui/button';

import styles from './AppLayout.module.css';

type ContextHeaderActionsProps = {
  developerMode: boolean;
  terminalOpen: boolean;
  onOpenTerminal: () => void;
};

export default function ContextHeaderActions({
  developerMode,
  terminalOpen,
  onOpenTerminal,
}: ContextHeaderActionsProps) {
  return (
    <div className={styles.headerActions}>
      {developerMode && !terminalOpen && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={styles.terminalButton}
          onClick={onOpenTerminal}
        >
          <Terminal size={15} aria-hidden />
          终端
        </Button>
      )}
    </div>
  );
}
