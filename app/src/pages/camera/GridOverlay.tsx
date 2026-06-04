import { Scan } from "lucide-react";

export default function GridOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="relative h-[380px] w-[500px]">
        {/* Grid Lines */}
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

        {/* Focus Label */}
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5">
            <Scan size={14} className="text-[#3B82F6]" />
            <span className="text-[12px] text-white">对准植物叶片</span>
          </div>
        </div>
      </div>
    </div>
  );
}
