import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { MemoryRouter } from "react-router";
import App from "./App";
import "./styles/global.css";

// 桌面应用无浏览器地址栏，使用 MemoryRouter 管理窗口内导航
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </ConfigProvider>
  </React.StrictMode>,
);
