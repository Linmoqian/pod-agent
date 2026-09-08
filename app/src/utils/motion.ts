/*
 * 共享动效预设:苹果式 spring(以刚度/阻尼塑形,无固定时长)。
 * 使用方须配合 useReducedMotion 在"减少动态效果"时退化为零时长。
 * Created on 2026-09-08
 * @author: https://github.com/Linmoqian
 */

import type { Transition } from "motion/react";

/** 常规进入与状态切换:消息气泡、会话内容 */
export const SPRING_STANDARD: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 32,
  mass: 0.9,
};

/** 侧栏折叠等结构性位移:稍硬,避免布局动画发飘 */
export const SPRING_LAYOUT: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 34,
};

export const REDUCED_MOTION_TRANSITION: Transition = { duration: 0 };
