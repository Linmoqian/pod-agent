import { create } from "zustand";
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
  sending: boolean;

  loadSessions: () => Promise<void>;
  loadMessages: (sessionId: string) => Promise<void>;
  createConversation: () => Promise<void>;
  setActiveSession: (id: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  addMessage: (role: string, content: string) => Promise<ChatMessage>;
  sendMessage: (content: string) => Promise<void>;
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
  sending: false,

  loadSessions: async () => {
    try {
      let sessions = await invoke<ChatSession[]>("get_sessions");
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

  sendMessage: async (content: string) => {
    const sessionId = get().activeSessionId;
    if (!sessionId) return;

    const tempAssistantId = `temp-assistant-${Date.now()}`;
    set((state) => ({
      messages: [
        ...state.messages,
        { id: `temp-user-${Date.now()}`, session_id: sessionId, role: "user", content, created_at: new Date().toISOString() },
        { id: tempAssistantId, session_id: sessionId, role: "assistant", content: "", created_at: new Date().toISOString() },
      ],
      sending: true,
    }));

    try {
      const { listen } = await import("@tauri-apps/api/event");
      const unlisten = await listen<{ session_id: string; delta: string }>("llm-chunk", (event) => {
        if (event.payload.session_id !== sessionId) return;
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === tempAssistantId ? { ...m, content: m.content + event.payload.delta } : m
          ),
        }));
      });

      await invoke("send_llm_message", { sessionId, content });
      unlisten();

      await Promise.all([get().loadMessages(sessionId), get().loadSessions()]);
    } catch (e) {
      console.error("发送消息失败:", e);
      set((state) => ({ messages: state.messages.filter((m) => m.id !== tempAssistantId) }));
    } finally {
      set({ sending: false });
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
