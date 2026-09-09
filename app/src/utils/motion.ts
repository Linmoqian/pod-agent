/*
 * 共享动效预设:结构性拖拽使用可中断 spring,高频会话切换使用短促 tween。
 * 使用方须配合 useReducedMotion 在"减少动态效果"时退化为零时长。
 * Created on 2026-09-08
 * Updated on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import type { Transition } from "motion/react";

/** 侧栏折叠等结构性位移:无弹跳并保持中途反向时的连续性。 */
export const SPRING_LAYOUT: Transition = {
  type: "spring",
  duration: 0.26,
  bounce: 0,
};

/** 会话导航属于高频操作，只保留空间关系所需的轻量横向过渡。 */
export const SESSION_ENTER_TRANSITION: Transition = {
  type: "tween",
  duration: 0.14,
  ease: [0.23, 1, 0.32, 1],
};

export const SESSION_EXIT_TRANSITION: Transition = {
  type: "tween",
  duration: 0.1,
  ease: [0.23, 1, 0.32, 1],
};

export const REDUCED_MOTION_TRANSITION: Transition = { duration: 0 };
