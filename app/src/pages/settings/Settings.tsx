import { useState, useEffect } from "react";
import { useSettingsStore } from "../../store";
import { invoke } from "@tauri-apps/api/core";
import { Settings as SettingsIcon, User, HardDrive, Bell, Info, Bot, Key } from "lucide-react";
import { SettingsRow, Section } from "../../components";

const navItems = [
  { id: "general", label: "通用", icon: SettingsIcon },
  { id: "account", label: "账户", icon: User },
  { id: "agent", label: "Agent 设置", icon: Bot },
  { id: "api", label: "API 配置", icon: Key },
  { id: "data", label: "数据管理", icon: HardDrive },
  { id: "notifications", label: "通知", icon: Bell },
  { id: "about", label: "关于", icon: Info },
];

const providers = [
  { id: "openai", name: "OpenAI", endpoint: "https://api.openai.com/v1" },
  { id: "anthropic", name: "Anthropic", endpoint: "https://api.anthropic.com/v1" },
  { id: "deepseek", name: "DeepSeek", endpoint: "https://api.deepseek.com/v1" },
  { id: "custom", name: "自定义", endpoint: "" },
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
    storagePath,
    sessionDbPath,
    apiConfig,
    setLanguage,
    toggleDarkMode,
    setAgentModel,
    setTemperature,
    setContextLength,
    toggleAutoSave,
    setStoragePath,
    toggleAutoBackup,
    setBackupFrequency,
    setDataFormat,
    setSessionDbPath,
    setApiConfig,
  } = useSettingsStore();

  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showTempInput, setShowTempInput] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latency_ms: number; message: string } | null>(null);

  // 页面加载时从后端读取配置
  useEffect(() => {
    const init = async () => {
      try {
        const config = await invoke<{
          provider: string;
          api_key: string;
          endpoint: string;
          model: string;
          session_db_path: string;
        }>("load_llm_config");
        setApiConfig({
          provider: config.provider,
          apiKey: config.api_key,
          endpoint: config.endpoint,
          model: config.model,
        });
        if (config.session_db_path) {
          setSessionDbPath(config.session_db_path);
        }
      } catch (e) {
        console.error("加载配置失败:", e);
      }
    };
    init();
  }, []);

  const handleSaveApiConfig = async () => {
    try {
      await invoke("save_llm_config", {
        config: {
          provider: apiConfig.provider,
          api_key: apiConfig.apiKey,
          endpoint: apiConfig.endpoint,
          model: apiConfig.model,
          session_db_path: sessionDbPath,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("保存配置失败:", e);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await invoke<{ success: boolean; latency_ms: number; message: string }>("test_llm_connection", {
        config: {
          provider: apiConfig.provider,
          api_key: apiConfig.apiKey,
          endpoint: apiConfig.endpoint,
          model: apiConfig.model,
          session_db_path: sessionDbPath,
        },
      });
      setTestResult(result);
    } catch (e) {
      setTestResult({ success: false, latency_ms: 0, message: String(e) });
    } finally {
      setTesting(false);
    }
  };

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
          {/* General */}
          {activeNav === "general" && (
            <>
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
            </>
          )}

          {/* Agent Settings */}
          {activeNav === "agent" && (
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
          )}

          {/* API Configuration */}
          {activeNav === "api" && (
            <>
              <Section title="LLM API 配置">
                <div className="px-4 py-3">
                  <label className="mb-1.5 block text-[12px] font-medium text-[#6B7280]">服务提供商</label>
                  <div className="relative">
                    <button
                      onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                      className="flex w-full items-center justify-between rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-[13px] text-[#374151] hover:border-[#9CA3AF]"
                    >
                      {providers.find((p) => p.id === apiConfig.provider)?.name || "选择提供商"}
                      <svg className="h-4 w-4 text-[#6B7280]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    {showProviderDropdown && (
                      <div className="absolute left-0 top-full z-10 mt-1 w-full rounded-lg border border-[#E5E7EB] bg-white py-1 shadow-lg">
                        {providers.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setApiConfig({ provider: p.id, endpoint: p.endpoint });
                              setShowProviderDropdown(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-[13px] hover:bg-[#F3F4F6] ${
                              apiConfig.provider === p.id ? "font-medium text-[#0A84FF]" : "text-[#374151]"
                            }`}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-4 py-3">
                  <label className="mb-1.5 block text-[12px] font-medium text-[#6B7280]">API Endpoint</label>
                  <input
                    type="text"
                    value={apiConfig.endpoint}
                    onChange={(e) => setApiConfig({ endpoint: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                    className="w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-[13px] text-[#374151] outline-none focus:border-[#0A84FF]"
                  />
                </div>

                <div className="px-4 py-3">
                  <label className="mb-1.5 block text-[12px] font-medium text-[#6B7280]">API Key</label>
                  <div className="relative">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={apiConfig.apiKey}
                      onChange={(e) => setApiConfig({ apiKey: e.target.value })}
                      placeholder="sk-..."
                      className="w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 pr-10 text-[13px] text-[#374151] outline-none focus:border-[#0A84FF]"
                    />
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#374151]"
                    >
                      {showApiKey ? (
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="px-4 py-3">
                  <label className="mb-1.5 block text-[12px] font-medium text-[#6B7280]">模型名称</label>
                  <input
                    type="text"
                    value={apiConfig.model}
                    onChange={(e) => setApiConfig({ model: e.target.value })}
                    placeholder="gpt-4"
                    className="w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-[13px] text-[#374151] outline-none focus:border-[#0A84FF]"
                  />
                </div>
              </Section>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveApiConfig}
                  className="rounded-lg bg-[#0A84FF] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#0070E0]"
                >
                  {saved ? "已保存 ✓" : "保存配置"}
                </button>
                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="rounded-lg bg-[#374151] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#4B5563] disabled:opacity-50"
                >
                  {testing ? "测试中..." : "测试连接"}
                </button>
                {testResult && (
                  <span className={`text-[12px] ${testResult.success ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
                    {testResult.message}
                  </span>
                )}
              </div>
            </>
          )}

          {/* Data Management */}
          {activeNav === "data" && (
            <Section title="数据管理">
              <div className="px-4 py-3">
                <label className="mb-1.5 block text-[12px] font-medium text-[#6B7280]">数据存储路径</label>
                <input
                  type="text"
                  value={storagePath}
                  onChange={(e) => setStoragePath(e.target.value)}
                  placeholder="~/.pod-agent/data"
                  className="w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-[13px] text-[#374151] outline-none focus:border-[#0A84FF]"
                />
                <p className="mt-1 text-[11px] text-[#9CA3AF]">
                  会话数据和育种数据将存储在此路径下
                </p>
              </div>
              <div className="px-4 py-3">
                <label className="mb-1.5 block text-[12px] font-medium text-[#6B7280]">会话数据库路径</label>
                <input
                  type="text"
                  value={sessionDbPath}
                  onChange={(e) => setSessionDbPath(e.target.value)}
                  placeholder="~/.pod-agent/sessions.db"
                  className="w-full rounded-lg border border-[#D1D5DB] bg-white px-3 py-2 text-[13px] text-[#374151] outline-none focus:border-[#0A84FF]"
                />
                <p className="mt-1 text-[11px] text-[#9CA3AF]">
                  会话历史数据将存储在此 SQLite 数据库文件中
                </p>
              </div>
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
          )}

          {/* Placeholder for other sections */}
          {!["general", "agent", "api", "data"].includes(activeNav) && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 rounded-full bg-[#F3F4F6] p-4">
                {navItems.find((n) => n.id === activeNav) && (
                  <Key size={32} className="text-[#9CA3AF]" />
                )}
              </div>
              <p className="text-[14px] font-medium text-[#374151]">功能开发中</p>
              <p className="text-[13px] text-[#9CA3AF]">此模块即将上线</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
