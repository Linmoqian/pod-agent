import { create } from "zustand";

interface ApiConfig {
  provider: string;
  apiKey: string;
  endpoint: string;
  model: string;
}

interface SettingsState {
  language: string;
  darkMode: boolean;
  agentModel: string;
  temperature: number;
  contextLength: string;
  autoSave: boolean;
  storagePath: string;
  autoBackup: boolean;
  backupFrequency: string;
  dataFormat: string;
  sessionDbPath: string;
  apiConfig: ApiConfig;
  setLanguage: (lang: string) => void;
  toggleDarkMode: () => void;
  setAgentModel: (model: string) => void;
  setTemperature: (temp: number) => void;
  setContextLength: (length: string) => void;
  toggleAutoSave: () => void;
  setStoragePath: (path: string) => void;
  toggleAutoBackup: () => void;
  setBackupFrequency: (freq: string) => void;
  setDataFormat: (format: string) => void;
  setSessionDbPath: (path: string) => void;
  setApiConfig: (config: Partial<ApiConfig>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  language: "简体中文",
  darkMode: false,
  agentModel: "Pod Agent Pro",
  temperature: 0.7,
  contextLength: "128K tokens",
  autoSave: true,
  storagePath: "/Volumes/base/project/pod-agent/data",
  sessionDbPath: "",
  autoBackup: true,
  backupFrequency: "每天",
  dataFormat: "CSV + JSON",
  apiConfig: {
    provider: "openai",
    apiKey: "",
    endpoint: "https://api.openai.com/v1",
    model: "gpt-4",
  },
  setLanguage: (language) => set({ language }),
  toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
  setAgentModel: (agentModel) => set({ agentModel }),
  setTemperature: (temperature) => set({ temperature }),
  setContextLength: (contextLength) => set({ contextLength }),
  toggleAutoSave: () => set((state) => ({ autoSave: !state.autoSave })),
  setStoragePath: (storagePath) => set({ storagePath }),
  toggleAutoBackup: () => set((state) => ({ autoBackup: !state.autoBackup })),
  setBackupFrequency: (backupFrequency) => set({ backupFrequency }),
  setDataFormat: (dataFormat) => set({ dataFormat }),
  setSessionDbPath: (sessionDbPath) => set({ sessionDbPath }),
  setApiConfig: (config) =>
    set((state) => ({
      apiConfig: { ...state.apiConfig, ...config },
    })),
}));
