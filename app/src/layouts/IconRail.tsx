/*
 * lian@育种台窄图标栏：只保留工作区与设置，不暴露前端模型密钥。
 * Created on 2026-09-12
 * Updated on 2026-09-13
 * @author: https://github.com/Linmoqian
 */
import { useState } from "react";
import { ChevronLeft, ChevronRight, MessageCircle, Settings } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import BrandMark from "../components/common/BrandMark";
import SettingsModal from "../features/settings/components/SettingsModal";
import styles from "./IconRail.module.css";

function RailButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={styles.navItem}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      data-active={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function IconRail({
  workbenchOpen,
  onToggleWorkbench,
}: {
  workbenchOpen: boolean;
  onToggleWorkbench: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <nav className={styles.rail} aria-label="主导航">
      <div className={styles.logo} title="lian@育种台">
        <BrandMark size={42} label="lian@lab" />
      </div>
      <RailButton label="研究工作区" active>
        <MessageCircle size={22} strokeWidth={1.75} />
      </RailButton>
      <Tooltip>
        <TooltipTrigger asChild>
          <RailButton
            label={workbenchOpen ? "收起育种台" : "展开育种台"}
            onClick={onToggleWorkbench}
          >
            {workbenchOpen ? (
              <ChevronRight size={20} strokeWidth={1.75} />
            ) : (
              <ChevronLeft size={20} strokeWidth={1.75} />
            )}
          </RailButton>
        </TooltipTrigger>
        <TooltipContent side="right">
          {workbenchOpen ? "收起育种台" : "展开育种台"}
        </TooltipContent>
      </Tooltip>
      <div className={styles.spacer} />
      <Tooltip>
        <TooltipTrigger asChild>
          <RailButton label="设置" onClick={() => setSettingsOpen(true)}>
            <Settings size={22} strokeWidth={1.75} />
          </RailButton>
        </TooltipTrigger>
        <TooltipContent side="right">设置</TooltipContent>
      </Tooltip>
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </nav>
  );
}

export default IconRail;
