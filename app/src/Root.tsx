/*
 * 根组件:编排全局 Provider。
 * SettingsProvider 持有主题/模式上下文并写 <html data-theme>,shadcn 组件经 CSS 变量跟随切换明暗;
 * TooltipProvider 服务全局 tooltip;Toaster 承载全局提示;MemoryRouter 服务窗口内导航。
 * Created on 2026-09-08
 * Updated on 2026-09-16
 * @author: https://github.com/Linmoqian
 */

import { MemoryRouter } from "react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import App from "./App";
import { SettingsProvider } from "./features/settings/context";
import { Provider } from "react-redux";
import { store } from "./store";
import { isTauriRuntime } from "./services/workspace";
import { migrateLegacyProviderKeys } from "./features/providers/services/credentials";

function CredentialMigrationNotice() {
  useEffect(() => {
    if (!isTauriRuntime()) return;
    void migrateLegacyProviderKeys().then((migrated) => {
      if (!migrated) {
        toast.error("旧版 API Key 未能迁移到 macOS Keychain，请重试");
      }
    });
  }, []);
  return null;
}

export default function Root() {
  return (
    <Provider store={store}>
      <CredentialMigrationNotice />
      <SettingsProvider>
        <TooltipProvider delayDuration={200}>
          <MemoryRouter>
            <App />
          </MemoryRouter>
          <Toaster position="top-center" />
        </TooltipProvider>
      </SettingsProvider>
    </Provider>
  );
}
