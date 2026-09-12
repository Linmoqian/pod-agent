/*
 * lian@育种台窄图标栏：只保留工作区与设置，不暴露前端模型密钥。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */
import { useState } from "react";
import { Tooltip } from "antd";

import AppIcon from "../components/common/AppIcon";
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
        <AppIcon name="brand-sprout" size={27} />
      </div>
      <RailButton label="研究工作区" active>
        <AppIcon name="chat" size={22} />
      </RailButton>
      <Tooltip
        title={workbenchOpen ? "收起育种台" : "展开育种台"}
        placement="right"
      >
        <RailButton
          label={workbenchOpen ? "收起育种台" : "展开育种台"}
          onClick={onToggleWorkbench}
        >
          <AppIcon
            name="panel-arrow"
            size={19}
            transform={workbenchOpen ? "none" : "rotate-180"}
          />
        </RailButton>
      </Tooltip>
      <div className={styles.spacer} />
      <Tooltip title="设置" placement="right">
        <RailButton label="设置" onClick={() => setSettingsOpen(true)}>
          <AppIcon name="settings" size={22} />
        </RailButton>
      </Tooltip>
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </nav>
  );
}

export default IconRail;
