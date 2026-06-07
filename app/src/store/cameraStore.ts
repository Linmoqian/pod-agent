import { create } from "zustand";
import { invoke, Channel } from "@tauri-apps/api/core";

// ── 类型 ──────────────────────────────────────────────────────

export interface CameraDevice {
  id: string;
  name: string;
}

export interface PhotoRecord {
  id: string;
  filePath: string;
  thumbnailPath: string;
  capturedAt: string;
  width: number;
  height: number;
  mode: string;
  /** JSON 编码的检测结果，无检测数据时为 null */
  detections: string | null;
}

export interface Detection {
  classId: number;
  className: string;
  confidence: number;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

type CameraEvent =
  | { event: "frame"; data: { data: string; width: number; height: number } }
  | { event: "detections"; data: { detections: Detection[]; inferenceMs: number } }
  | { event: "error"; data: { message: string } };

// ── State ─────────────────────────────────────────────────────

// 模块级变量，不暴露到 store 公共接口
let frameCallback: ((b64: string, w: number, h: number) => void) | null = null;

interface CameraState {
  mode: "photo" | "video" | "document" | "scan";
  flash: "auto" | "on" | "off";
  timer: number;
  isRecording: boolean;

  // 摄像头设备
  devices: CameraDevice[];
  activeDeviceId: string | null;
  isStreaming: boolean;

  // 最近拍摄
  lastPhotoPath: string | null;
  lastPhotoData: string | null;
  lastThumbnailData: string | null;

  // 照片浏览
  photoList: PhotoRecord[];
  currentPhotoIndex: number;
  viewingPhotoData: string | null;
  thumbnailMap: Record<string, string>; // id → base64

  // YOLO 实时检测
  yoloLoaded: boolean;
  isDetecting: boolean;
  detections: Detection[];
  detectionMs: number | null;
  frameWidth: number;
  frameHeight: number;

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
  switchDevice: (deviceId: string) => Promise<void>;
  capturePhoto: () => Promise<string | null>;
  loadLastPhoto: () => Promise<void>;

  // 照片浏览
  loadPhotoList: () => Promise<void>;
  openPhotoViewer: (startIndex: number) => Promise<void>;
  navigatePhoto: (direction: 1 | -1) => Promise<void>;
  closePhotoViewer: () => void;
  loadThumbnails: () => Promise<void>;

  // YOLO 实时检测
  loadYoloModel: () => Promise<void>;
  toggleDetection: () => void;
}

export const useCameraStore = create<CameraState>((set, get) => ({
  mode: "photo",
  flash: "auto",
  timer: 0,
  isRecording: false,

  devices: [],
  activeDeviceId: null,
  isStreaming: false,

  lastPhotoPath: null,
  lastPhotoData: null,
  lastThumbnailData: null,

  photoList: [],
  currentPhotoIndex: 0,
  viewingPhotoData: null,
  thumbnailMap: {},

  yoloLoaded: false,
  isDetecting: false,
  detections: [],
  detectionMs: null,
  frameWidth: 0,
  frameHeight: 0,

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
    frameCallback = onFrame;

    const onEvent = new Channel();
    onEvent.onmessage = (msg) => {
      const e = msg as CameraEvent;
      if (e.event === "frame") {
        set({ frameWidth: e.data.width, frameHeight: e.data.height });
        frameCallback?.(e.data.data, e.data.width, e.data.height);
      } else if (e.event === "detections") {
        set({ detections: e.data.detections, detectionMs: e.data.inferenceMs });
      }
    };

    await invoke("start_camera_preview", { deviceId, onFrame: onEvent });

    set({ isStreaming: true, activeDeviceId: deviceId ?? get().devices[0]?.id ?? null });
  },

  stopPreview: async () => {
    await invoke("stop_camera_preview");
    frameCallback = null;
    set({ isStreaming: false });
  },

  switchDevice: async (deviceId) => {
    const { isStreaming } = get();
    if (!isStreaming || !frameCallback) return;

    await invoke("stop_camera_preview");
    set({ isStreaming: false });

    await get().startPreview(deviceId, frameCallback);
  },

  capturePhoto: async () => {
    try {
      const { isDetecting, detections } = get();
      const result = await invoke<{ photoPath: string; photoData: string; thumbnailData: string }>("capture_photo", {
        detections: isDetecting ? detections : null,
      });
      set({
        lastPhotoPath: result.photoPath,
        lastPhotoData: result.photoData,
        lastThumbnailData: result.thumbnailData,
      });
      return result.photoPath;
    } catch (e) {
      console.error("拍照失败:", e);
      return null;
    }
  },

  loadLastPhoto: async () => {
    try {
      const thumbnailData = await invoke<string | null>("load_last_photo");
      if (thumbnailData) {
        set({ lastThumbnailData: thumbnailData });
      }
    } catch (e) {
      console.error("加载最近照片失败:", e);
    }
  },

  loadPhotoList: async () => {
    try {
      const list = await invoke<PhotoRecord[]>("list_photos", { limit: 100, offset: 0 });
      set({ photoList: list });
      get().loadThumbnails();
    } catch (e) {
      console.error("加载照片列表失败:", e);
    }
  },

  openPhotoViewer: async (startIndex: number) => {
    try {
      await get().loadPhotoList();
      const { photoList } = get();
      if (photoList.length === 0) return;

      const index = Math.min(startIndex, photoList.length - 1);
      const b64 = await invoke<string>("read_photo_data", { path: photoList[index].filePath });
      set({ currentPhotoIndex: index, viewingPhotoData: b64 });
    } catch (e) {
      console.error("打开照片浏览器失败:", e);
    }
  },

  navigatePhoto: async (direction: 1 | -1) => {
    const { photoList, currentPhotoIndex } = get();
    const newIndex = currentPhotoIndex + direction;
    if (newIndex < 0 || newIndex >= photoList.length) return;

    try {
      const b64 = await invoke<string>("read_photo_data", { path: photoList[newIndex].filePath });
      set({ currentPhotoIndex: newIndex, viewingPhotoData: b64 });
    } catch (e) {
      console.error("切换照片失败:", e);
    }
  },

  closePhotoViewer: () => {
    set({ photoList: [], currentPhotoIndex: 0, viewingPhotoData: null, thumbnailMap: {} });
  },

  loadThumbnails: async () => {
    const { photoList, thumbnailMap } = get();

    photoList.forEach(async (photo) => {
      if (thumbnailMap[photo.id]) return;
      try {
        const b64 = await invoke<string>("read_photo_data", { path: photo.thumbnailPath });
        set((state) => ({ thumbnailMap: { ...state.thumbnailMap, [photo.id]: b64 } }));
      } catch {
        // 跳过加载失败的缩略图
      }
    });
  },

  loadYoloModel: async () => {
    try {
      await invoke("load_yolo_model", { modelPath: null });
      set({ yoloLoaded: true });
    } catch (e) {
      console.error("加载 YOLO 模型失败:", e);
    }
  },

  toggleDetection: () => {
    const next = !get().isDetecting;
    set({ isDetecting: next, detections: next ? get().detections : [] });
    invoke("set_yolo_detecting", { enabled: next }).catch(() => {});
  },
}));
