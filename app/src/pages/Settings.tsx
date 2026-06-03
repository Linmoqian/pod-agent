import { useState } from "react";
import { useSettingsStore } from "../store/appStore";
import { Settings as SettingsIcon, User, HardDrive, Bell, Info, Bot } from "lucide-react";
import { SettingsRow, Section } from "../components";

const navItems = [
  { id: "general", label: "通用", icon: SettingsIcon },
  { id: "account", label: "账户", icon: User },
  { id: "agent", label: "Agent 设置", icon: Bot },
  { id: "data", label: "数据管理", icon: HardDrive },
  { id: "notifications", label: "通知", icon: Bell },
  { id: "about", label: "关于", icon: Info },
];

export default function Settings() {
  const [activeNav, setActiveNav] = useState("general");
  const {
    language,
    darkMode,
    agentModel,
    temperature,
    contextLength,
    autoSave,
    autoBackup,
    backupFrequency,
    dataFormat,
    setLanguage,
    toggleDarkMode,
    setAgentModel,
    setTemperature,
    setContextLength,
    toggleAutoSave,
    toggleAutoBackup,
    setBackupFrequency,
    setDataFormat,
  } = useSettingsStore();

  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showTempInput, setShowTempInput] = useState(false);

  return (
    <div className="flex h-full bg-[#ECECEC]">
      <aside className="w-[260px] bg-[#F5F5F7] p-5">
        <h1 className="mb-4 text-[13px] font-semibold tracking-wide text-[#86868B]">设置</h1>
        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                  isActive ? "bg-[#0A84FF] text-white" : "text-[#1D1D1F] hover:bg-black/5"
                }`}
              >
                <Icon size={16} className={isActive ? "text-white" : "text-[#86868B]"} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 overflow-auto bg-white p-8">
        <h2 className="mb-1 text-[28px] font-bold text-[#1D1D1F]">
          {navItems.find((n) => n.id === activeNav)?.label}
        </h2>
        <p className="mb-7 text-[13px] text-[#86868B]">管理应用的基本配置</p>

        <div className="space-y-5">
          <Section title="应用信息">
            <SettingsRow label="应用名称" value="Pod Agent" />
            <SettingsRow label="版本" value="0.1.0" />
            <SettingsRow label="构建" value="2026.06.03" />
          </Section>

          <Section title="语言与地区">
            <SettingsRow
              label="界面语言"
              value={language}
              suffix="chevron-right"
              onClick={() => setLanguage(language === "简体中文" ? "English" : "简体中文")}
            />
            <SettingsRow label="深色模式" toggle={darkMode} onToggle={toggleDarkMode} />
          </Section>

          <Section title="AGENT 设置">
            <div className="relative">
              <SettingsRow
                label="默认模型"
                value={agentModel}
                suffix="chevron-right"
                onClick={() => setShowModelDropdown(!showModelDropdown)}
              />
              {showModelDropdown && (
                <div className="absolute right-4 top-full z-10 mt-1 w-48 rounded-lg border border-[#E5E7EB] bg-white py-1 shadow-lg">
                  {["Pod Agent Pro", "Pod Agent Standard", "Pod Agent Lite"].map((model) => (
                    <button
                      key={model}
                      onClick={() => {
                        setAgentModel(model);
                        setShowModelDropdown(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-[13px] hover:bg-[#F3F4F6] ${
                        agentModel === model ? "font-medium text-[#0A84FF]" : "text-[#374151]"
                      }`}
                    >
                      {model}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <SettingsRow
                label="温度"
                value={String(temperature)}
                suffix="chevron-right"
                onClick={() => setShowTempInput(!showTempInput)}
              />
              {showTempInput && (
                <div className="absolute right-4 top-full z-10 mt-1 rounded-lg border border-[#E5E7EB] bg-white p-3 shadow-lg">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-48"
                  />
                  <p className="mt-1 text-center text-[12px] text-[#6B7280]">{temperature}</p>
                </div>
              )}
            </div>
            <SettingsRow
              label="上下文长度"
              value={contextLength}
              suffix="chevron-right"
              onClick={() => setContextLength(contextLength === "128K tokens" ? "64K tokens" : "128K tokens")}
            />
            <SettingsRow label="自动保存对话" toggle={autoSave} onToggle={toggleAutoSave} />
          </Section>

          <Section title="数据管理">
            <SettingsRow label="存储路径" value="~/pod-agent/data" suffix="chevron-right" />
            <SettingsRow label="自动备份" toggle={autoBackup} onToggle={toggleAutoBackup} />
            <SettingsRow
              label="备份频率"
              value={backupFrequency}
              suffix="chevron-right"
              onClick={() => setBackupFrequency(backupFrequency === "每天" ? "每周" : "每天")}
            />
            <SettingsRow
              label="数据格式"
              value={dataFormat}
              suffix="chevron-right"
              onClick={() => setDataFormat(dataFormat === "CSV + JSON" ? "CSV" : "CSV + JSON")}
            />
            <SettingsRow label="清理缓存" action="清理" onAction={() => alert("缓存已清理")} />
          </Section>
        </div>
      </main>
    </div>
  );
}
