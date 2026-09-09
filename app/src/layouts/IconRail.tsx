/*
 * 左侧窄图标栏(参考 X-line AppShell 布局):Logo、主导航与底部工具入口。
 * 相机/模型提供商/设置三个模态入口从会话侧栏迁移至此;宽度固定 68px 不折叠。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import { useState } from "react";
import { Tooltip } from "antd";
import AppIcon from "../components/common/AppIcon";
import CameraModal from "../features/camera/components/CameraModal";
import ProviderSettingsModal from "../features/providers/components/ProviderSettingsModal";
import SettingsModal from "../features/settings/components/SettingsModal";
import styles from "./IconRail.module.css";

/* 原生 button 而非 antd:48px 方形导航位需完全控制圆角与 hover 反馈 */
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

function IconRail() {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);

  return (
    <nav className={styles.rail} aria-label="主导航">
      {/* 品牌位:仅图标,名称由底部状态栏承载 */}
      <div className={styles.logo} title="Pod Agent">
        <AppIcon name="brand-sprout" size={27} />
      </div>

      <RailButton label="智能助手" active>
        <AppIcon name="chat" size={22} />
      </RailButton>

      <div className={styles.spacer} />

      <Tooltip title="打开相机" placement="right">
        <RailButton label="打开相机" onClick={() => setCameraOpen(true)}>
          <AppIcon name="camera" size={22} />
        </RailButton>
      </Tooltip>
      <Tooltip title="模型提供商设置" placement="right">
        <RailButton label="模型提供商设置" onClick={() => setProviderOpen(true)}>
          <AppIcon name="provider-server" size={22} />
        </RailButton>
      </Tooltip>
      <Tooltip title="设置" placement="right">
        <RailButton label="设置" onClick={() => setSettingsOpen(true)}>
          <AppIcon name="settings" size={22} />
        </RailButton>
      </Tooltip>

      <CameraModal open={cameraOpen} onClose={() => setCameraOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ProviderSettingsModal
        open={providerOpen}
        onClose={() => setProviderOpen(false)}
      />
    </nav>
  );
}

export default IconRail;
