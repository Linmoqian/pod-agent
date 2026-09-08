/*
 * 全局设置上下文:主题偏好与体验模式。
 * 职责:localStorage 持久化、system 偏好跟随操作系统、解析后主题写入
 * <html data-theme>(tokens.css 据此切换明暗变量集)。antd 侧的明暗算法
 * 由 Root.tsx 中的 ThemeAwareConfigProvider 读取 resolvedTheme 完成。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  isExperienceMode,
  isThemePreference,
  type AppSettings,
  type ExperienceMode,
  type ResolvedTheme,
  type ThemePreference,
} from "./types";

const STORAGE_KEY = "pod-agent.settings";
const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";
const DEFAULT_SETTINGS: AppSettings = {
  themePreference: "light",
  experienceMode: "novice",
};

/* 存储被占用或内容损坏时回退默认值,不阻塞应用启动 */
function readStoredSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      themePreference: isThemePreference(parsed.themePreference)
        ? parsed.themePreference
        : DEFAULT_SETTINGS.themePreference,
      experienceMode: isExperienceMode(parsed.experienceMode)
        ? parsed.experienceMode
        : DEFAULT_SETTINGS.experienceMode,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/* 跟随系统明暗;matchMedia 缺失的环境(旧 WebView)退化为浅色 */
function useSystemTheme(): ResolvedTheme {
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    window.matchMedia?.(SYSTEM_DARK_QUERY).matches ? "dark" : "light",
  );

  useEffect(() => {
    const media = window.matchMedia?.(SYSTEM_DARK_QUERY);
    if (!media) return;
    const onChange = (event: MediaQueryListEvent) =>
      setSystemTheme(event.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return systemTheme;
}

type SettingsContextValue = {
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  experienceMode: ExperienceMode;
  setThemePreference: (preference: ThemePreference) => void;
  setExperienceMode: (mode: ExperienceMode) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(readStoredSettings);
  const systemTheme = useSystemTheme();

  const resolvedTheme: ResolvedTheme =
    settings.themePreference === "system"
      ? systemTheme
      : settings.themePreference;

  /* 副作用集中在此:HTML 根节点携带解析后主题,供 CSS Token 切换 */
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      themePreference: settings.themePreference,
      resolvedTheme,
      experienceMode: settings.experienceMode,
      setThemePreference: (themePreference) =>
        setSettings((previous) => ({ ...previous, themePreference })),
      setExperienceMode: (experienceMode) =>
        setSettings((previous) => ({ ...previous, experienceMode })),
    }),
    [settings, resolvedTheme],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings 必须在 SettingsProvider 内使用");
  }
  return context;
}
