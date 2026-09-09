/*
 * 根组件:编排全局 Provider。
 * Redux Provider 承载模型提供商等跨组件状态;SettingsProvider 持有主题/模式
 * 上下文;ThemeAwareConfigProvider 读取解析后主题,让 antd 组件与 CSS Token
 * 同步切换明暗;MemoryRouter 服务窗口内导航。
 * Created on 2026-09-08
 * Updated on 2026-09-09
 * @author: https://github.com/Linmoqian
 */

import { App as AntApp, ConfigProvider, theme as antdTheme } from "antd";
import zhCN from "antd/locale/zh_CN";
import type { ReactNode } from "react";
import { Provider as ReduxProvider } from "react-redux";
import { MemoryRouter } from "react-router";
import App from "./App";
import { SettingsProvider, useSettings } from "./features/settings/context";
import { store } from "./store";

const SHARED_TOKENS = {
  borderRadius: 12,
  borderRadiusLG: 20,
  controlHeight: 40,
  fontSize: 16,
  motionDurationFast: "0.12s",
  motionDurationMid: "0.18s",
  motionDurationSlow: "0.24s",
  motionEaseOut: "cubic-bezier(0.23, 1, 0.32, 1)",
  motionEaseOutCirc: "cubic-bezier(0.23, 1, 0.32, 1)",
  motionEaseInOut: "cubic-bezier(0.77, 0, 0.175, 1)",
  motionEaseInOutCirc: "cubic-bezier(0.77, 0, 0.175, 1)",
  motionEaseOutBack: "cubic-bezier(0.23, 1, 0.32, 1)",
  motionEaseInBack: "cubic-bezier(0.23, 1, 0.32, 1)",
  fontFamily:
    'system-ui, -apple-system, BlinkMacSystemFont, "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
} as const;

/* antd 明暗两套色板对齐设计 Token(docs/design/2026-09-08-scau-inspired-design-tokens.md 第 10、13 节)。
 * 暗色主色取偏深绿以保证按钮白字对比度,链接色单独提亮保证暗底可读。 */
const ANTD_TOKENS = {
  light: {
    colorPrimary: "#40814f",
    colorLink: "#40814f",
    colorInfo: "#3bb4ab",
    colorSuccess: "#40814f",
    colorWarning: "#edc25d",
    colorError: "#b93e2e",
    colorTextBase: "#333333",
    colorBgLayout: "#fafcf8",
    colorBorder: "#d5d5d5",
    colorBorderSecondary: "#e8e8e8",
  },
  dark: {
    colorPrimary: "#3f8456",
    colorLink: "#6aa877",
    colorInfo: "#55c2b8",
    colorSuccess: "#6aa877",
    colorWarning: "#f0cd77",
    colorError: "#d9705f",
    colorTextBase: "#e8ece7",
    colorBgLayout: "#101613",
    colorBorder: "#3a443c",
    colorBorderSecondary: "#2a332c",
  },
} as const;

function ThemeAwareConfigProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useSettings();
  const isDark = resolvedTheme === "dark";
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark
          ? antdTheme.darkAlgorithm
          : antdTheme.defaultAlgorithm,
        token: { ...SHARED_TOKENS, ...ANTD_TOKENS[resolvedTheme] },
      }}
    >
      {/* AntApp 提供 App.useApp() 的 message/notification 上下文,如模型提供商设置面板;
       * 其包裹 div 默认无高度,会打断 html/body/#root 的 height:100% 链,需显式续上 */}
      <AntApp style={{ height: "100%" }}>{children}</AntApp>
    </ConfigProvider>
  );
}

export default function Root() {
  return (
    <ReduxProvider store={store}>
      <SettingsProvider>
        <ThemeAwareConfigProvider>
          <MemoryRouter>
            <App />
          </MemoryRouter>
        </ThemeAwareConfigProvider>
      </SettingsProvider>
    </ReduxProvider>
  );
}
