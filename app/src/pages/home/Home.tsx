import { useNavigate } from "react-router-dom";
import { MessageSquare, FolderOpen, BarChart3, Camera } from "lucide-react";

const features = [
  {
    label: "智能对话",
    desc: "AI 驱动的育种助手",
    icon: MessageSquare,
    route: "/chat",
  },
  {
    label: "文件管理",
    desc: "统一管理育种数据",
    icon: FolderOpen,
    route: "/files",
  },
  {
    label: "数据分析",
    desc: "表格预览与处理",
    icon: BarChart3,
    route: "/excel",
  },
  {
    label: "图像采集",
    desc: "摄像头文档扫描",
    icon: Camera,
    route: "/camera",
  },
];

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-canvas">
      <h1 className="text-5xl font-bold tracking-tight text-ink">
        Pod Agent
      </h1>
      <p className="text-xl font-light tracking-wide text-ink-muted-48">
        以智能体为核心的智慧育种桌面系统
      </p>

      <div className="mt-6 flex gap-4">
        {features.map((f) => {
          const Icon = f.icon;
          return (
            <button
              key={f.label}
              onClick={() => navigate(f.route)}
              className="flex w-[190px] flex-col items-center gap-2.5 rounded-[18px] bg-canvas-parchment px-6 py-6 transition-colors hover:bg-divider-soft"
            >
              <Icon size={32} className="text-primary" />
              <span className="text-[15px] font-semibold text-ink">
                {f.label}
              </span>
              <span className="text-xs text-ink-muted-48">{f.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
