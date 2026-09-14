/*
 * 设置模态:外观(主题)、模式与关于三个区块。
 * 选项卡片为同组互斥单选,以 aria-pressed 表达选中态;
 * 主题/模式状态读写走 SettingsContext,由其负责持久化与 <html data-theme>。
 * Created on 2026-09-08
 * Updated on 2026-09-13
 * @author: https://github.com/Linmoqian
 */

import { Code2, FlaskConical, Monitor, Moon, Search, Sprout, Sun, SlidersHorizontal, UserRound } from 'lucide-react';
import { motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { version } from "../../../../package.json";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogOverlay,
} from "@/components/ui/dialog";
import BrandMark from "../../../components/common/BrandMark";
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
  icon: ReactNode;
};

const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    value: "light",
    label: "浅色",
    description: "米绿画布与白色卡片的默认外观。",
    icon: <Sun size={21} strokeWidth={1.75} />,
  },
  {
    value: "dark",
    label: "深色",
    description: "深绿墨色画布,适合暗光环境。",
    icon: <Moon size={21} strokeWidth={1.75} />,
  },
  {
    value: "system",
    label: "跟随系统",
    description: "随操作系统外观自动切换。",
    icon: <Monitor size={21} strokeWidth={1.75} />,
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
            icon={icon}
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
  icon: ReactNode;
};

/* 体验模式决定功能可见度与解释密度;当前作为全局偏好持久化,供各功能读取裁剪 */
const MODE_OPTIONS: readonly ModeOption[] = [
  {
    value: "novice",
    label: "新手",
    description: "提供引导与解释,隐藏高级参数,适合首次使用。",
    icon: <Sprout size={21} strokeWidth={1.75} />,
  },
  {
    value: "expert",
    label: "专家",
    description: "开放完整功能与参数,精简引导,适合熟练用户。",
    icon: <FlaskConical size={21} strokeWidth={1.75} />,
  },
  {
    value: "developer",
    label: "开发人员",
    description: "额外显示调试信息与原始数据,用于开发与排障。",
    icon: <Code2 size={21} strokeWidth={1.75} />,
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
            icon={icon}
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
          <BrandMark size={42} />
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
  const [activeSection, setActiveSection] = useState('appearance');
  const [query, setQuery] = useState('');
  const sections = [
    { id: 'appearance', label: '外观', hint: '主题与界面', icon: <SlidersHorizontal size={16} /> },
    { id: 'mode', label: '工作模式', hint: '助手行为', icon: <UserRound size={16} /> },
    { id: 'about', label: '关于', hint: '版本信息', icon: <Code2 size={16} /> },
  ];
  const normalizedQuery = query.trim().toLowerCase();
  const visible = (text: string) =>
    !normalizedQuery || text.toLowerCase().includes(normalizedQuery);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogOverlay className={styles.modalOverlay} />
      <DialogContent
        className={`${styles.modalContent} sm:max-w-[760px]`}
      >
        <div className={styles.settingsLayout}>
          <aside className={styles.settingsNav} aria-label="设置分类">
            <DialogHeader>
              <DialogTitle className={styles.modalTitle}>设置</DialogTitle>
              <p className={styles.modalSubtitle}>配置你的 Agent 工作环境</p>
            </DialogHeader>
            <label className={styles.search}>
              <Search size={15} aria-hidden />
              <input aria-label="搜索设置" placeholder="搜索设置" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <nav className={styles.sectionNav}>
              {sections.map((section) => (
                <button key={section.id} type="button" data-active={activeSection === section.id} onClick={() => { setActiveSection(section.id); document.getElementById(`settings-${section.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                  {section.icon}<span><strong>{section.label}</strong><small>{section.hint}</small></span>
                </button>
              ))}
            </nav>
            <span className={styles.navFooter}>Pod Agent · v{version}</span>
          </aside>
          <motion.div className={styles.body} layout transition={{ duration: 0.2 }}>
            {visible('外观主题') && <motion.div key="appearance" id="settings-appearance" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}><ThemeSection /></motion.div>}
            {visible('工作模式助手行为') && <motion.div key="mode" id="settings-mode" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}><ModeSection /></motion.div>}
            {visible('关于版本信息') && <motion.div key="about" id="settings-about" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}><AboutSection /></motion.div>}
            {normalizedQuery && !sections.some((section) => visible(section.label + section.hint)) && <p className={styles.noResults}>没有找到匹配的设置</p>}
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SettingsModal;
