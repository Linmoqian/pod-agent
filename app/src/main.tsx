import React from "react";
import ReactDOM from "react-dom/client";
import { App as AntApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { MemoryRouter } from "react-router";
import { Provider as ReduxProvider } from "react-redux";
import App from "./App";
import { store } from "./store";
import "./styles/global.css";

// antd 主题对齐设计 Token(docs/design/2026-09-08-scau-inspired-design-tokens.md)
const antdTheme = {
  token: {
    colorPrimary: "#40814f",
    colorInfo: "#3bb4ab",
    colorSuccess: "#40814f",
    colorWarning: "#edc25d",
    colorError: "#b93e2e",
    colorTextBase: "#333333",
    colorBgLayout: "#fafcf8",
    colorBorder: "#d5d5d5",
    colorBorderSecondary: "#e8e8e8",
    borderRadius: 10,
    fontFamily:
      '"Source Han Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  },
};

// 桌面应用无浏览器地址栏,使用 MemoryRouter 管理窗口内导航;
// ReduxProvider 承载模型提供商等跨组件状态,AntApp 提供 message 上下文
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ReduxProvider store={store}>
      <ConfigProvider locale={zhCN} theme={antdTheme}>
        <AntApp>
          <MemoryRouter>
            <App />
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </ReduxProvider>
  </React.StrictMode>,
);
