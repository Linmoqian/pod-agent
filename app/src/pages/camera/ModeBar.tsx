import { useCameraStore } from "../../store";

const modes = [
  { id: "photo", label: "拍照" },
  { id: "video", label: "录像" },
  { id: "document", label: "文档" },
  { id: "scan", label: "扫描" },
] as const;

export default function ModeBar() {
  const { mode, setMode } = useCameraStore();

  return (
    <div className="flex items-center justify-center gap-6 bg-black py-3">
      {modes.map((m) => (
        <button
          key={m.id}
          onClick={() => setMode(m.id)}
          className={`text-[13px] transition-colors ${
            mode === m.id ? "font-semibold text-white" : "text-white/50 hover:text-white/70"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
