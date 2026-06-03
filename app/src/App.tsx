import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { Home as HomeIcon, Settings as SettingsIcon, FolderOpen, MessageSquare, Camera as CameraIcon, Table2 } from "lucide-react";
import "./styles/global.css";

import HomePage from "./pages/home/Home";
import SettingsPage from "./pages/settings/Settings";
import FileManagerPage from "./pages/files/FileManager";
import AgentChatPage from "./pages/chat/AgentChat";
import CameraPage from "./pages/camera/Camera";
import ExcelPreviewPage from "./pages/excel/ExcelPreview";

const navItems = [
  { to: "/", label: "首页", icon: HomeIcon },
  { to: "/chat", label: "Agent 聊天", icon: MessageSquare },
  { to: "/files", label: "文件管理", icon: FolderOpen },
  { to: "/excel", label: "表格预览", icon: Table2 },
  { to: "/camera", label: "相机", icon: CameraIcon },
  { to: "/settings", label: "设置", icon: SettingsIcon },
];

function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen flex-col">
        {/* Top Navigation Bar */}
        <nav className="flex items-center gap-1 border-b border-[#E5E7EB] bg-[#0F172A] px-4 py-2">
          <span className="mr-4 text-[15px] font-bold text-white">Pod Agent</span>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
                    isActive
                      ? "bg-white/15 text-white"
                      : "text-white/60 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                <Icon size={15} />
                {item.label}
              </NavLink>
            );
          })}
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
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
