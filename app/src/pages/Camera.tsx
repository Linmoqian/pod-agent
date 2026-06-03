import { useState } from "react";
import { useCameraStore } from "../store/appStore";
import { X, Zap, ZapOff, Timer, Settings, Scan, RefreshCw } from "lucide-react";

const modes = [
  { id: "photo", label: "拍照" },
  { id: "video", label: "录像" },
  { id: "document", label: "文档" },
  { id: "scan", label: "扫描" },
];

export default function Camera() {
  const { mode, flash, timer, isRecording, setMode, toggleFlash, setTimer, toggleRecording } = useCameraStore();

  const [showSettings, setShowSettings] = useState(false);
  const [captured, setCaptured] = useState(false);

  const handleCapture = () => {
    if (mode === "video") {
      toggleRecording();
    } else {
      setCaptured(true);
      setTimeout(() => setCaptured(false), 200);
    }
  };

  const handleSwitchCamera = () => {
    alert("切换前后摄像头");
  };

  return (
    <div className="flex h-full flex-col bg-black">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <button className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30">
          <X size={18} />
        </button>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleFlash}
            className={`flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/30 ${
              flash === "on" ? "bg-[#FBBF24]/30 text-[#FBBF24]" : "bg-white/20 text-white"
            }`}
          >
            {flash === "off" ? <ZapOff size={18} /> : <Zap size={18} />}
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
          >
            <Timer size={18} />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* Settings Dropdown */}
      {showSettings && (
        <div className="absolute right-6 top-16 z-10 w-[200px] rounded-lg border border-white/20 bg-black/80 p-3">
          <p className="mb-2 text-[12px] text-white/60">定时拍摄</p>
          <div className="flex gap-2">
            {[0, 3, 5, 10].map((t) => (
              <button
                key={t}
                onClick={() => setTimer(t)}
                className={`flex-1 rounded py-1 text-[12px] ${
                  timer === t ? "bg-white text-black" : "bg-white/20 text-white"
                }`}
              >
                {t === 0 ? "关闭" : `${t}s`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Viewfinder */}
      <div className="relative flex flex-1 items-center justify-center bg-[#1A1A2E]">
        {/* Grid Overlay */}
        <div className="relative h-[380px] w-[500px]">
          <div className="absolute left-[33%] top-0 h-full w-px bg-white/20" />
          <div className="absolute left-[66%] top-0 h-full w-px bg-white/20" />
          <div className="absolute left-0 top-[33%] h-px w-full bg-white/20" />
          <div className="absolute left-0 top-[66%] h-px w-full bg-white/20" />

          {/* Focus Frame */}
          <div className="absolute left-[30%] top-[26%] h-[180px] w-[200px]">
            <div className="absolute left-0 top-0 h-6 w-6 rounded-tl-[6px] border-l-2 border-t-2 border-[#3B82F6]" />
            <div className="absolute right-0 top-0 h-6 w-6 rounded-tr-[6px] border-r-2 border-t-2 border-[#3B82F6]" />
            <div className="absolute bottom-0 left-0 h-6 w-6 rounded-bl-[6px] border-b-2 border-l-2 border-[#3B82F6]" />
            <div className="absolute bottom-0 right-0 h-6 w-6 rounded-br-[6px] border-b-2 border-r-2 border-[#3B82F6]" />
          </div>
        </div>

        {/* Focus Label */}
        <div className="absolute bottom-[42%] flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5">
          <Scan size={14} className="text-[#3B82F6]" />
          <span className="text-[12px] text-white">对准植物叶片</span>
        </div>

        {/* Capture Flash Effect */}
        {captured && <div className="absolute inset-0 bg-white" />}
      </div>

      {/* Mode Bar */}
      <div className="flex items-center justify-center gap-6 bg-black py-3">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id as typeof mode)}
            className={`text-[13px] transition-colors ${
              mode === m.id ? "font-semibold text-white" : "text-white/50 hover:text-white/70"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Bottom Bar */}
      <div className="flex items-center justify-between bg-black px-12 py-5">
        {/* Gallery Preview */}
        <button className="h-14 w-14 overflow-hidden rounded-xl border-2 border-white/40 bg-[#374151]">
          <div className="h-full w-full bg-gradient-to-br from-green-500/30 to-blue-500/30" />
        </button>

        {/* Capture Button */}
        <button
          onClick={handleCapture}
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white transition-transform active:scale-95"
        >
          {mode === "video" ? (
            isRecording ? (
              <div className="h-6 w-6 rounded-sm bg-red-500" />
            ) : (
              <div className="h-14 w-14 rounded-full bg-red-500" />
            )
          ) : (
            <div className="h-14 w-14 rounded-full bg-white" />
          )}
        </button>

        {/* Switch Camera */}
        <button
          onClick={handleSwitchCamera}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
        >
          <RefreshCw size={22} />
        </button>
      </div>
    </div>
  );
}
