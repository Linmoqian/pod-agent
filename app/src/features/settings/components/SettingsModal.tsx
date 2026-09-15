/*
 * 设置模态:外观、工作模式与关于三个独立页面。
 * 选项卡片为同组互斥单选,以 aria-pressed 表达选中态;
 * 主题/模式状态读写走 SettingsContext,由其负责持久化与 <html data-theme>。
 * Created on 2026-09-08
 * Updated on 2026-09-15
 * @author: https://github.com/Linmoqian
 */

import { Bot, Code2, FlaskConical, Monitor, Moon, Search, Sprout, Sun, SlidersHorizontal, UserRound } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { version } from "../../../../package.json";
import developerOnePortrait from "@/assets/developer-1.jpg";
import developerTwoPortrait from "@/assets/developer-2.jpg";
import developerThreePortrait from "@/assets/developer-3.png";
import scauLogo from "@/assets/scau-logo.png";
import lifeSciencesCollegeLogo from "@/assets/life-sciences-college-logo.png";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogOverlay,
} from "@/components/ui/dialog";
import BrandMark from "../../../components/common/BrandMark";
import { ProviderSettingsPanel } from "../../providers/components/ProviderSettingsModal";
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

const DEVELOPERS = [
  { name: "linmoqian", portrait: developerOnePortrait, accent: "purple" },
  { name: "qcl", portrait: developerTwoPortrait, accent: "blue" },
  { name: "牛学长", portrait: developerThreePortrait, accent: "orange" },
] as const;

function AboutSection() {
  const reduceMotion = useReducedMotion();

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
      <div
        className={styles.supportCard}
        role="group"
        aria-label="支持单位：华南农业大学 生命科学学院"
      >
        <div className={styles.supportLogos}>
          <a
            className={styles.supportLogoLink}
            href="https://scau.edu.cn/"
            target="_blank"
            rel="noreferrer"
            aria-label="访问华南农业大学官网"
          >
            <img className={styles.supportLogo} src={scauLogo} alt="华南农业大学校徽" />
          </a>
          <span className={styles.supportLogoDivider} aria-hidden>·</span>
          <a
            className={styles.supportLogoLink}
            href="https://life.scau.edu.cn/"
            target="_blank"
            rel="noreferrer"
            aria-label="访问生命科学学院官网"
          >
            <img
              className={styles.supportLogo}
              src={lifeSciencesCollegeLogo}
              alt="生命科学学院校徽"
            />
          </a>
        </div>
        <div className={styles.supportText}>
          <span className={styles.supportLabel}>支持单位</span>
          <strong className={styles.supportName}>华南农业大学</strong>
          <span className={styles.supportDepartment}>生命科学学院</span>
        </div>
      </div>
      <div className={styles.developerGrid} aria-label="开发人员">
        {DEVELOPERS.map(({ name, portrait, accent }, index) => (
          <motion.div
            key={name}
            className={styles.developerCard}
            data-accent={accent}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.24, delay: index * 0.08 }}
            whileHover={reduceMotion ? undefined : { y: -3 }}
          >
            <img className={styles.developerPortrait} src={portrait} alt={`${name} 的开发人员肖像`} />
            <span className={styles.developerRole}>开发人员</span>
            <strong className={styles.developerName}>{name}</strong>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

type SettingsSection = 'appearance' | 'mode' | 'model' | 'about';

function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');
  const [query, setQuery] = useState('');
  const reduceMotion = useReducedMotion();
  const { experienceMode } = useSettings();
  const sections: ReadonlyArray<{
    id: SettingsSection;
    label: string;
    hint: string;
    keywords: readonly string[];
    icon: ReactNode;
  }> = [
    { id: 'appearance', label: '外观', hint: '主题与界面', keywords: ['浅色', '深色', '系统', '主题'], icon: <SlidersHorizontal size={16} /> },
    { id: 'mode', label: '工作模式', hint: '助手行为', keywords: ['新手', '专家', '开发人员', '引导', '调试'], icon: <UserRound size={16} /> },
    ...(experienceMode === 'developer'
      ? [{ id: 'model' as const, label: '模型', hint: '提供商与密钥', keywords: ['模型', '提供商', '密钥', '端点'], icon: <Bot size={16} /> }]
      : []),
    { id: 'about', label: '关于', hint: '版本信息', keywords: ['版本', '作者', '开发成员', 'pod agent'], icon: <Code2 size={16} /> },
  ];
  useEffect(() => {
    if (experienceMode !== 'developer' && activeSection === 'model') {
      setActiveSection('mode');
    }
  }, [activeSection, experienceMode]);
  const normalizedQuery = query.trim().toLowerCase();
  const matchingSections = sections.filter((section) =>
    `${section.label}${section.hint}${section.keywords.join('')}`
      .toLowerCase()
      .includes(normalizedQuery),
  );
  const selectSection = (section: SettingsSection) => {
    setActiveSection(section);
    setQuery('');
  };
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
              <input
                aria-label="搜索设置"
                placeholder="搜索设置"
                value={query}
                onChange={(event) => {
                  const nextQuery = event.target.value;
                  setQuery(nextQuery);
                  const normalized = nextQuery.trim().toLowerCase();
                  const matches = sections.filter((section) =>
                    `${section.label}${section.hint}${section.keywords.join('')}`
                      .toLowerCase()
                      .includes(normalized),
                  );
                  if (normalized && matches.length === 1) setActiveSection(matches[0].id);
                }}
              />
            </label>
            <nav className={styles.sectionNav}>
              <AnimatePresence initial={false}>
                {matchingSections.map((section) => (
                  <motion.button
                    key={section.id}
                    type="button"
                    data-active={activeSection === section.id}
                    aria-current={activeSection === section.id ? 'page' : undefined}
                    onClick={() => selectSection(section.id)}
                    initial={section.id === 'model' && !reduceMotion ? { opacity: 0, y: -8 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 460, damping: 34, mass: 0.65 }}
                  >
                    {section.icon}<span><strong>{section.label}</strong><small>{section.hint}</small></span>
                  </motion.button>
                ))}
              </AnimatePresence>
            </nav>
            <span className={styles.navFooter}>Pod Agent · v{version}</span>
          </aside>
          <motion.div
            className={styles.body}
            layout
            transition={
              reduceMotion
                ? { duration: 0 }
                : { layout: { type: 'spring', stiffness: 420, damping: 38, mass: 0.8 } }
            }
          >
            {matchingSections.length ? (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeSection}
                  initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.14, ease: 'easeOut' }}
                >
                  {activeSection === 'appearance' && <ThemeSection />}
                  {activeSection === 'mode' && <ModeSection />}
                  {activeSection === 'model' && <ProviderSettingsPanel />}
                  {activeSection === 'about' && <AboutSection />}
                </motion.div>
              </AnimatePresence>
            ) : (
              <p className={styles.noResults}>没有找到匹配的设置</p>
            )}
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SettingsModal;
