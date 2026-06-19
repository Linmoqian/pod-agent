import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PhotoRecord } from "./cameraStore";

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  thinking: string;
  tool_calls?: string;
  tool_call_id?: string;
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
  previewFileId: string | null;
  previewPhotoMeta: PhotoRecord | null;

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
  setPreviewFile: (id: string | null) => void;
  setPreviewPhoto: (photo: PhotoRecord | null) => void;
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
  previewFileId: null,
  previewPhotoMeta: null,

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

    const now = Date.now();
    const tempAssistantId = `temp-assistant-${now}`;
    set((state) => ({
      messages: [
        ...state.messages,
        { id: `temp-user-${now}`, session_id: sessionId, role: "user", content, thinking: "", created_at: new Date(now).toISOString() },
        { id: tempAssistantId, session_id: sessionId, role: "assistant", content: "", thinking: "", created_at: new Date(now).toISOString() },
      ],
      sending: true,
    }));

    try {
      const onStream = (field: "content" | "thinking", event: { session_id: string; delta: string }) => {
        if (event.session_id !== sessionId) return;
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === tempAssistantId ? { ...m, [field]: m[field] + event.delta } : m
          ),
        }));
      };

      const unlistenChunk = await listen<{ session_id: string; delta: string }>("llm-chunk", (e) => onStream("content", e.payload));
      const unlistenThinking = await listen<{ session_id: string; delta: string }>("llm-thinking", (e) => onStream("thinking", e.payload));

      const unlistenToolCall = await listen<{
        session_id: string;
        tool_call_id: string;
        name: string;
        args: unknown;
      }>("llm-tool-call", (e) => {
        if (e.payload.session_id !== sessionId) return;
        const toolMsg: ChatMessage = {
          id: `temp-tool-${e.payload.tool_call_id}`,
          session_id: sessionId,
          role: "tool",
          content: "",
          thinking: "",
          tool_calls: JSON.stringify([
            { function: { name: e.payload.name, arguments: e.payload.args } },
          ]),
          tool_call_id: e.payload.tool_call_id,
          created_at: new Date().toISOString(),
        };
        set((state) => {
          const msgs = [...state.messages];
          const idx = msgs.findIndex((m) => m.id === tempAssistantId);
          msgs.splice(idx === -1 ? msgs.length : idx, 0, toolMsg);
          return { messages: msgs };
        });
      });

      const unlistenToolResult = await listen<{
        session_id: string;
        tool_call_id: string;
        success: boolean;
        result: unknown;
      }>("llm-tool-result", (e) => {
        if (e.payload.session_id !== sessionId) return;
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === `temp-tool-${e.payload.tool_call_id}`
              ? { ...m, content: JSON.stringify(e.payload.result) }
              : m
          ),
        }));
      });

      await invoke("send_llm_message", { sessionId, content });
      unlistenChunk();
      unlistenThinking();
      unlistenToolCall();
      unlistenToolResult();

      await get().loadMessages(sessionId);
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, updated_at: new Date().toISOString() } : s
        ),
      }));
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
  setPreviewFile: (id) => set({ previewFileId: id, previewPhotoMeta: null }),
  setPreviewPhoto: (photo) => set({
    previewPhotoMeta: photo,
    previewFileId: null,
  }),
}));
