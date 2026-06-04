import { useCameraStore } from "../../store";
import { Video } from "lucide-react";

interface CameraDevicePickerProps {
  onSelect: (deviceId: string) => void;
  onClose: () => void;
}

export default function CameraDevicePicker({ onSelect, onClose }: CameraDevicePickerProps) {
  const { devices, activeDeviceId } = useCameraStore();

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[280px] rounded-xl border border-white/20 bg-[#1A1A2E] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-[13px] font-medium text-white">选择摄像头</p>
        <div className="flex flex-col gap-1">
          {devices.map((d) => (
            <button
              key={d.id}
              onClick={() => onSelect(d.id)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors ${
                d.id === activeDeviceId
                  ? "bg-[#3B82F6]/20 text-[#3B82F6]"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Video size={16} />
              <span className="truncate">{d.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
