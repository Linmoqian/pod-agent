import { useCameraStore } from "../../store";

export default function CameraSettings() {
  const { timer, setTimer } = useCameraStore();

  return (
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
  );
}
