/*
 * 根组件:编排全局 Provider。
 * SettingsProvider 持有主题/模式上下文并写 <html data-theme>,shadcn 组件经 CSS 变量跟随切换明暗;
 * TooltipProvider 服务全局 tooltip;Toaster 承载全局提示;MemoryRouter 服务窗口内导航。
 * Created on 2026-09-08
 * Updated on 2026-09-14
 * @author: https://github.com/Linmoqian
 */

import { MemoryRouter } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import App from "./App";
import { SettingsProvider } from "./features/settings/context";

export default function Root() {
  return (
    <SettingsProvider>
      <TooltipProvider delayDuration={200}>
        <MemoryRouter>
          <App />
        </MemoryRouter>
        <Toaster position="top-center" />
      </TooltipProvider>
    </SettingsProvider>
  );
}
