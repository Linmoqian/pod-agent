import { create } from "zustand";

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
