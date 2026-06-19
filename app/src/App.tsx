import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { Search } from "lucide-react";
import "./styles/global.css";

import HomePage from "./pages/home/Home";
import SettingsPage from "./pages/settings/Settings";
import FileManagerPage from "./pages/files/FileManager";
import AgentChatPage from "./pages/chat/AgentChat";
import CameraPage from "./pages/camera/Camera";
import ExcelPreviewPage from "./pages/excel/ExcelPreview";
import ToolsPage from "./pages/tools/Tools";

const navItems = [
  { to: "/", label: "首页" },
  { to: "/chat", label: "智能体对话" },
  { to: "/tools", label: "工具" },
  { to: "/files", label: "文件管理" },
  { to: "/camera", label: "相机" },
  { to: "/excel", label: "数据预览" },
  { to: "/settings", label: "设置" },
];

function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen flex-col">
        {/* Apple-style global nav: 44px black bar */}
        <nav className="flex h-[44px] shrink-0 items-center justify-between bg-surface-black px-6">
          <span className="text-sm font-semibold text-body-on-dark">Pod Agent</span>

          <div className="flex items-center gap-6">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `text-xs transition-colors ${
                    isActive
                      ? "text-body-on-dark"
                      : "text-white/50 hover:text-white/80"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <Search size={14} className="text-body-on-dark" />
            <div className="h-7 w-7 rounded-full bg-primary" />
          </div>
        </nav>

        {/* Page Content */}
        <div className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/files" element={<FileManagerPage />} />
            <Route path="/chat" element={<AgentChatPage />} />
            <Route path="/camera" element={<CameraPage />} />
            <Route path="/excel" element={<ExcelPreviewPage />} />
            <Route path="/tools" element={<ToolsPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
