import { create } from "zustand";
import { invoke, Channel } from "@tauri-apps/api/core";

// ── 类型 ──────────────────────────────────────────────────────

export interface CameraDevice {
  id: string;
  name: string;
}

type CameraEvent =
  | { event: "frame"; data: { data: string; width: number; height: number } }
  | { event: "error"; data: { message: string } };

// ── State ─────────────────────────────────────────────────────

interface CameraState {
  mode: "photo" | "video" | "document" | "scan";
  flash: "auto" | "on" | "off";
  timer: number;
  isRecording: boolean;

  // 摄像头设备
  devices: CameraDevice[];
  activeDeviceId: string | null;
  isStreaming: boolean;

  // Actions
  setMode: (mode: "photo" | "video" | "document" | "scan") => void;
  toggleFlash: () => void;
  setTimer: (seconds: number) => void;
  toggleRecording: () => void;

  loadDevices: () => Promise<void>;
  startPreview: (
    deviceId: string | null,
    onFrame: (b64: string, w: number, h: number) => void,
  ) => Promise<void>;
  stopPreview: () => Promise<void>;
}

export const useCameraStore = create<CameraState>((set, get) => ({
  mode: "photo",
  flash: "auto",
  timer: 0,
  isRecording: false,

  devices: [],
  activeDeviceId: null,
  isStreaming: false,

  setMode: (mode) => set({ mode }),
  toggleFlash: () =>
    set((state) => ({
      flash: state.flash === "auto" ? "on" : state.flash === "on" ? "off" : "auto",
    })),
  setTimer: (timer) => set({ timer }),
  toggleRecording: () => set((state) => ({ isRecording: !state.isRecording })),

  loadDevices: async () => {
    const devices = await invoke<CameraDevice[]>("list_cameras");
    set({ devices });
  },

  startPreview: async (deviceId, onFrame) => {
    const onEvent = new Channel();
    onEvent.onmessage = (msg) => {
      const e = msg as CameraEvent;
      if (e.event === "frame") {
        onFrame(e.data.data, e.data.width, e.data.height);
      }
    };

    await invoke("start_camera_preview", { deviceId, onFrame });

    set({ isStreaming: true, activeDeviceId: deviceId ?? get().devices[0]?.id ?? null });
  },

  stopPreview: async () => {
    await invoke("stop_camera_preview");
    set({ isStreaming: false });
  },
}));
