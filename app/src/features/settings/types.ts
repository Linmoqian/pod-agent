/*
 * 设置域类型:主题偏好、解析后主题与体验模式。
 * 合法值数组供解析 localStorage 时做类型守卫,新增选项须同步此处。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

export type ThemePreference = "light" | "dark" | "system";

export type ResolvedTheme = "light" | "dark";

export type ExperienceMode = "novice" | "expert" | "developer";

export type AppSettings = {
  themePreference: ThemePreference;
  experienceMode: ExperienceMode;
};

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  "light",
  "dark",
  "system",
];

export const EXPERIENCE_MODES: readonly ExperienceMode[] = [
  "novice",
  "expert",
  "developer",
];

export const isThemePreference = (
  value: unknown,
): value is ThemePreference =>
  typeof value === "string" &&
  (THEME_PREFERENCES as readonly string[]).includes(value);

export const isExperienceMode = (
  value: unknown,
): value is ExperienceMode =>
  typeof value === "string" &&
  (EXPERIENCE_MODES as readonly string[]).includes(value);
