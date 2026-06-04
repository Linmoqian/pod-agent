import { useCameraStore } from "../../store";

const modes = [
  { id: "photo" as const, label: "拍照" },
  { id: "video" as const, label: "录像" },
  { id: "document" as const, label: "文档" },
  { id: "scan" as const, label: "扫描" },
];

export default function ModeBar() {
  const { mode, setMode } = useCameraStore();

  return (
    <div className="flex shrink-0 items-center justify-center gap-6 bg-black py-3">
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
