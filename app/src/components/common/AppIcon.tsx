/*
 * 图片生成的农业图标统一入口:PNG 只提供 alpha 轮廓,颜色由 currentColor 决定。
 * Created on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import type { CSSProperties } from "react";
import addIcon from "../../assets/generated-icons/add.png";
import brandSproutIcon from "../../assets/generated-icons/brand-sprout.png";
import cameraIcon from "../../assets/generated-icons/camera.png";
import cameraOffIcon from "../../assets/generated-icons/camera-off.png";
import chatIcon from "../../assets/generated-icons/chat.png";
import credentialKeyIcon from "../../assets/generated-icons/credential-key.png";
import deleteIcon from "../../assets/generated-icons/delete.png";
import modeDeveloperIcon from "../../assets/generated-icons/mode-developer.png";
import modeExpertIcon from "../../assets/generated-icons/mode-expert.png";
import modeNoviceIcon from "../../assets/generated-icons/mode-novice.png";
import modelChipIcon from "../../assets/generated-icons/model-chip.png";
import panelArrowIcon from "../../assets/generated-icons/panel-arrow.png";
import providerGridIcon from "../../assets/generated-icons/provider-grid.png";
import providerServerIcon from "../../assets/generated-icons/provider-server.png";
import refreshIcon from "../../assets/generated-icons/refresh.png";
import retryIcon from "../../assets/generated-icons/retry.png";
import searchIcon from "../../assets/generated-icons/search.png";
import sendIcon from "../../assets/generated-icons/send.png";
import settingsIcon from "../../assets/generated-icons/settings.png";
import themeDarkIcon from "../../assets/generated-icons/theme-dark.png";
import themeLightIcon from "../../assets/generated-icons/theme-light.png";
import themeSystemIcon from "../../assets/generated-icons/theme-system.png";
import styles from "./AppIcon.module.css";

const ICON_ASSETS = {
  add: addIcon,
  "brand-sprout": brandSproutIcon,
  camera: cameraIcon,
  "camera-off": cameraOffIcon,
  chat: chatIcon,
  "credential-key": credentialKeyIcon,
  delete: deleteIcon,
  "mode-developer": modeDeveloperIcon,
  "mode-expert": modeExpertIcon,
  "mode-novice": modeNoviceIcon,
  "model-chip": modelChipIcon,
  "panel-arrow": panelArrowIcon,
  "provider-grid": providerGridIcon,
  "provider-server": providerServerIcon,
  refresh: refreshIcon,
  retry: retryIcon,
  search: searchIcon,
  send: sendIcon,
  settings: settingsIcon,
  "theme-dark": themeDarkIcon,
  "theme-light": themeLightIcon,
  "theme-system": themeSystemIcon,
} as const;

export type AppIconName = keyof typeof ICON_ASSETS;

export type AppIconProps = {
  name: AppIconName;
  size?: number;
  className?: string;
  label?: string;
  transform?: "none" | "rotate-90" | "rotate-180" | "flip-x";
};

function AppIcon({
  name,
  size = 20,
  className,
  label,
  transform = "none",
}: AppIconProps) {
  const style = {
    width: size,
    height: size,
    WebkitMaskImage: `url(${ICON_ASSETS[name]})`,
    maskImage: `url(${ICON_ASSETS[name]})`,
  } satisfies CSSProperties;

  return (
    <span
      className={[styles.icon, className].filter(Boolean).join(" ")}
      style={style}
      data-transform={transform === "none" ? undefined : transform}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

export default AppIcon;
