import { create } from "zustand";

// Settings Store
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

// File Manager Store
interface FileItem {
  id: string;
  name: string;
  type: string;
  size: string;
  time: string;
  icon: string;
  color: string;
}

interface FileManagerState {
  files: FileItem[];
  selectedFiles: string[];
  currentPath: string[];
  viewMode: "list" | "grid";
  searchQuery: string;
  selectFile: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  navigateTo: (path: string[]) => void;
  setViewMode: (mode: "list" | "grid") => void;
  setSearchQuery: (query: string) => void;
}

export const useFileManagerStore = create<FileManagerState>((set) => ({
  files: [
    { id: "1", name: "基因组数据", type: "文件夹", size: "-", time: "2026-06-01 14:30", icon: "folder", color: "#F59E0B" },
    { id: "2", name: "表型记录", type: "文件夹", size: "-", time: "2026-05-28 09:15", icon: "folder", color: "#F59E0B" },
    { id: "3", name: "育种方案.pdf", type: "PDF", size: "2.4 MB", time: "2026-05-25 16:42", icon: "file-text", color: "#EF4444" },
    { id: "4", name: "产量分析.xlsx", type: "Excel", size: "856 KB", time: "2026-05-20 11:08", icon: "file-spreadsheet", color: "#22C55E" },
    { id: "5", name: "田间照片", type: "文件夹", size: "-", time: "2026-05-18 08:20", icon: "folder", color: "#F59E0B" },
    { id: "6", name: "实验报告.docx", type: "Word", size: "1.2 MB", time: "2026-05-15 13:55", icon: "file-text", color: "#3B82F6" },
    { id: "7", name: "种子库清单.csv", type: "CSV", size: "45 KB", time: "2026-05-10 10:30", icon: "file-spreadsheet", color: "#22C55E" },
  ],
  selectedFiles: [],
  currentPath: ["全部文件", "育种数据", "2026年春季"],
  viewMode: "list",
  searchQuery: "",
  selectFile: (id) =>
    set((state) => ({
      selectedFiles: state.selectedFiles.includes(id)
        ? state.selectedFiles.filter((f) => f !== id)
        : [...state.selectedFiles, id],
    })),
  selectAll: () =>
    set((state) => ({
      selectedFiles: state.files.map((f) => f.id),
    })),
  clearSelection: () => set({ selectedFiles: [] }),
  navigateTo: (path) => set({ currentPath: path }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}));

// Chat Store
import { invoke } from "@tauri-apps/api/core";

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: string;
}

interface ChatState {
  sessions: ChatSession[];
  activeSessionId: string;
  messages: ChatMessage[];
  inputValue: string;
  sidebarOpen: boolean;
  viewMode: "split" | "chat";
  selectedModel: string;
  attachedFiles: string[];
  loading: boolean;

  loadSessions: () => Promise<void>;
  loadMessages: (sessionId: string) => Promise<void>;
  createConversation: () => Promise<void>;
  setActiveSession: (id: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  addMessage: (role: string, content: string) => Promise<ChatMessage>;
  setInputValue: (value: string) => void;
  toggleSidebar: () => void;
  setViewMode: (mode: "split" | "chat") => void;
  setSelectedModel: (model: string) => void;
  attachFile: (file: string) => void;
  detachFile: (file: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  activeSessionId: "",
  messages: [],
  inputValue: "",
  sidebarOpen: true,
  viewMode: "split",
  selectedModel: "Pod Agent Pro",
  attachedFiles: [],
  loading: false,

  loadSessions: async () => {
    try {
      let sessions = await invoke<ChatSession[]>("get_sessions");
      // 首次启动：无会话时创建演示会话
      if (sessions.length === 0) {
        const session = await invoke<ChatSession>("create_session", { title: "水稻基因组分析方案" });
        await invoke("create_message", { sessionId: session.id, role: "user", content: "请帮我分析基因组数据中的抗性基因分布，重点关注水稻品种间的差异。" });
        await invoke("create_message", { sessionId: session.id, role: "assistant", content: "已分析基因组数据，发现以下关键抗性基因分布：" });
        sessions = await invoke<ChatSession[]>("get_sessions");
      }
      set({ sessions });
      if (sessions.length > 0 && !get().activeSessionId) {
        set({ activeSessionId: sessions[0].id });
        await get().loadMessages(sessions[0].id);
      }
    } catch (e) {
      console.error("加载会话列表失败:", e);
    }
  },

  loadMessages: async (sessionId: string) => {
    try {
      const messages = await invoke<ChatMessage[]>("get_messages", { sessionId });
      set({ messages });
    } catch (e) {
      console.error("加载消息失败:", e);
    }
  },

  createConversation: async () => {
    try {
      const session = await invoke<ChatSession>("create_session", { title: "新对话" });
      set((state) => ({
        sessions: [session, ...state.sessions],
        activeSessionId: session.id,
        messages: [],
      }));
    } catch (e) {
      console.error("创建会话失败:", e);
    }
  },

  setActiveSession: (id) => {
    set({ activeSessionId: id });
    get().loadMessages(id);
  },

  deleteConversation: async (id) => {
    try {
      await invoke("delete_session", { sessionId: id });
      const sessions = get().sessions.filter((s) => s.id !== id);
      const newActive =
        get().activeSessionId === id
          ? sessions[0]?.id ?? ""
          : get().activeSessionId;
      set({ sessions, activeSessionId: newActive });
      if (newActive) {
        await get().loadMessages(newActive);
      } else {
        set({ messages: [] });
      }
    } catch (e) {
      console.error("删除会话失败:", e);
    }
  },

  addMessage: async (role, content) => {
    const sessionId = get().activeSessionId;
    if (!sessionId) throw new Error("没有活跃会话");
    try {
      const msg = await invoke<ChatMessage>("create_message", {
        sessionId,
        role,
        content,
      });
      set((state) => ({ messages: [...state.messages, msg] }));
      // 更新 sessions 列表中对应会话的 updated_at
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, updated_at: msg.created_at } : s
        ),
      }));
      return msg;
    } catch (e) {
      console.error("添加消息失败:", e);
      throw e;
    }
  },

  setInputValue: (value) => set({ inputValue: value }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  attachFile: (file) =>
    set((state) => ({
      attachedFiles: [...state.attachedFiles, file],
    })),
  detachFile: (file) =>
    set((state) => ({
      attachedFiles: state.attachedFiles.filter((f) => f !== file),
    })),
}));

// Camera Store
interface CameraState {
  mode: "photo" | "video" | "document" | "scan";
  flash: "auto" | "on" | "off";
  timer: number;
  isRecording: boolean;
  setMode: (mode: "photo" | "video" | "document" | "scan") => void;
  toggleFlash: () => void;
  setTimer: (seconds: number) => void;
  toggleRecording: () => void;
}

export const useCameraStore = create<CameraState>((set) => ({
  mode: "photo",
  flash: "auto",
  timer: 0,
  isRecording: false,
  setMode: (mode) => set({ mode }),
  toggleFlash: () =>
    set((state) => ({
      flash: state.flash === "auto" ? "on" : state.flash === "on" ? "off" : "auto",
    })),
  setTimer: (timer) => set({ timer }),
  toggleRecording: () => set((state) => ({ isRecording: !state.isRecording })),
}));

// Excel Store
interface ExcelState {
  selectedCell: string;
  formula: string;
  activeSheet: string;
  selectedRange: string[];
  selectCell: (cell: string) => void;
  setFormula: (formula: string) => void;
  setActiveSheet: (sheet: string) => void;
  selectRange: (cells: string[]) => void;
}

export const useExcelStore = create<ExcelState>((set) => ({
  selectedCell: "A1",
  formula: "=SUM(B2:B10)",
  activeSheet: "Sheet1",
  selectedRange: [],
  selectCell: (cell) => set({ selectedCell: cell }),
  setFormula: (formula) => set({ formula }),
  setActiveSheet: (sheet) => set({ activeSheet: sheet }),
  selectRange: (cells) => set({ selectedRange: cells }),
}));
