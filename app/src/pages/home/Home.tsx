import { useNavigate } from "react-router-dom";

const metrics = [
  { label: "实验总数", value: "24", color: "text-primary" },
  { label: "活跃品种", value: "128", color: "text-success" },
  { label: "待处理", value: "7", color: "text-warning" },
  { label: "本月完成", value: "156", color: "text-ink-muted-48" },
];

const recentActivities = [
  "小麦抗病育种实验 — 品种筛选阶段",
  "水稻产量分析 — 数据收集中",
  "玉米杂交组合 — 表型记录",
];

const quickActions = [
  { label: "新建实验", route: "/files" },
  { label: "导入数据", route: "/files" },
  { label: "启动对话", route: "/chat" },
  { label: "查看报告", route: "/excel" },
];

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col gap-7 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-semibold tracking-[-0.3px] text-ink">
          概览
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-ink">工程师</span>
          <div className="h-8 w-8 rounded-full bg-primary" />
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="flex flex-col gap-1.5 rounded-[18px] bg-canvas-parchment p-6"
          >
            <span className="text-[13px] text-ink-muted-48">{m.label}</span>
            <span className={`text-[32px] font-semibold ${m.color}`}>
              {m.value}
            </span>
          </div>
        ))}
      </div>

      {/* Content Row */}
      <div className="flex flex-1 gap-4">
        {/* Recent Activity */}
        <div className="flex flex-1 flex-col gap-4 rounded-[18px] bg-canvas-parchment p-6">
          <h2 className="text-[17px] font-semibold text-ink">最近活动</h2>
          <div className="flex flex-col gap-0">
            {recentActivities.map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 border-b border-hairline py-3 last:border-b-0"
              >
                <div className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                <span className="text-sm text-ink-muted-80">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex w-80 flex-col gap-3 rounded-[18px] bg-canvas-parchment p-6">
          <h2 className="text-[17px] font-semibold text-ink">快捷操作</h2>
          {quickActions.map((a) => (
            <button
              key={a.label}
              onClick={() => navigate(a.route)}
              className="rounded-[11px] bg-canvas py-3 text-sm font-medium text-primary transition-colors hover:bg-canvas-parchment"
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
