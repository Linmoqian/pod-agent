/*
 * 设置模态:外观(主题)、模式与关于三个区块。
 * 选项卡片为同组互斥单选,以 aria-pressed 表达选中态;
 * 主题/模式状态读写走 SettingsContext,由其负责持久化与 <html data-theme>。
 * Created on 2026-09-08
 * Updated on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { Modal } from "antd";
import type { ReactNode } from "react";
import { version } from "../../../../package.json";
import AppIcon, { type AppIconName } from "../../../components/common/AppIcon";
import { useSettings } from "../context";
import type { ExperienceMode, ThemePreference } from "../types";
import styles from "./SettingsModal.module.css";

type OptionCardProps = {
  label: string;
  description: string;
  icon: ReactNode;
  selected: boolean;
  onSelect: () => void;
};

/* 主题与模式共用的竖排选项卡片 */
function OptionCard({
  label,
  description,
  icon,
  selected,
  onSelect,
}: OptionCardProps) {
  return (
    <button
      type="button"
      className={styles.optionCard}
      data-selected={selected}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className={styles.optionIcon} aria-hidden>
        {icon}
      </span>
      <span className={styles.optionLabel}>{label}</span>
      <span className={styles.optionDescription}>{description}</span>
    </button>
  );
}

type ThemeOption = {
  value: ThemePreference;
  label: string;
  description: string;
  icon: AppIconName;
};

const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    value: "light",
    label: "浅色",
    description: "米绿画布与白色卡片的默认外观。",
    icon: "theme-light",
  },
  {
    value: "dark",
    label: "深色",
    description: "深绿墨色画布,适合暗光环境。",
    icon: "theme-dark",
  },
  {
    value: "system",
    label: "跟随系统",
    description: "随操作系统外观自动切换。",
    icon: "theme-system",
  },
];

function ThemeSection() {
  const { themePreference, setThemePreference } = useSettings();
  return (
    <section className={styles.section} aria-labelledby="settings-theme">
      <h3 id="settings-theme" className={styles.sectionTitle}>
        外观
      </h3>
      <div className={styles.optionGrid} role="group" aria-label="主题">
        {THEME_OPTIONS.map(({ value, label, description, icon }) => (
          <OptionCard
            key={value}
            label={label}
            description={description}
            icon={<AppIcon name={icon} size={21} />}
            selected={themePreference === value}
            onSelect={() => setThemePreference(value)}
          />
        ))}
      </div>
    </section>
  );
}

type ModeOption = {
  value: ExperienceMode;
  label: string;
  description: string;
  icon: AppIconName;
};

/* 体验模式决定功能可见度与解释密度;当前作为全局偏好持久化,供各功能读取裁剪 */
const MODE_OPTIONS: readonly ModeOption[] = [
  {
    value: "novice",
    label: "新手",
    description: "提供引导与解释,隐藏高级参数,适合首次使用。",
    icon: "mode-novice",
  },
  {
    value: "expert",
    label: "专家",
    description: "开放完整功能与参数,精简引导,适合熟练用户。",
    icon: "mode-expert",
  },
  {
    value: "developer",
    label: "开发人员",
    description: "额外显示调试信息与原始数据,用于开发与排障。",
    icon: "mode-developer",
  },
];

function ModeSection() {
  const { experienceMode, setExperienceMode } = useSettings();
  return (
    <section className={styles.section} aria-labelledby="settings-mode">
      <h3 id="settings-mode" className={styles.sectionTitle}>
        模式
      </h3>
      <div className={styles.optionGrid} role="group" aria-label="模式">
        {MODE_OPTIONS.map(({ value, label, description, icon }) => (
          <OptionCard
            key={value}
            label={label}
            description={description}
            icon={<AppIcon name={icon} size={21} />}
            selected={experienceMode === value}
            onSelect={() => setExperienceMode(value)}
          />
        ))}
      </div>
    </section>
  );
}

function AboutSection() {
  return (
    <section className={styles.section} aria-labelledby="settings-about">
      <h3 id="settings-about" className={styles.sectionTitle}>
        关于
      </h3>
      <div className={styles.aboutCard}>
        <span className={styles.aboutLogo} aria-hidden>
          <AppIcon name="brand-sprout" size={30} />
        </span>
        <div className={styles.aboutText}>
          <p className={styles.aboutName}>
            Pod Agent
            <span className={styles.aboutVersion}>v{version}</span>
          </p>
          <p className={styles.aboutDescription}>
            面向大豆育种的智能体助手，仍在持续拓展。
          </p>
          <p className={styles.aboutMeta}>
            作者：
            <a
              className={styles.aboutLink}
              href="https://github.com/Linmoqian"
              target="_blank"
              rel="noreferrer"
            >
              github.com/Linmoqian
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}

type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

function SettingsModal({ open, onClose }: SettingsModalProps) {
  return (
    <Modal
      title="设置"
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={560}
      rootClassName={styles.modalRoot}
      transitionName="pod-modal"
      maskTransitionName="pod-fade"
    >
      <div className={styles.body}>
        <ThemeSection />
        <ModeSection />
        <AboutSection />
      </div>
    </Modal>
  );
}

export default SettingsModal;
