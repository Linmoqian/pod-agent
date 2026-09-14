/*
 * shadcn/ui 组件共用的类名合并工具:clsx 组合条件类,tailwind-merge 去重冲突类。
 * Created on 2026-09-12
 * @author: https://github.com/Linmoqian
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
