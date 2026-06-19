import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  User,
  Bot,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

/// 一条工具调用历史（对应后端 tool_call_log）
interface ToolCallLog {
  id: string;
  caller: string; // 'human' | 'llm'
  toolName: string;
  args: string; // JSON 字符串
  result: string | null; // JSON 字符串，当时返回的真相
  status: string;
  error: string | null;
  sessionId: string | null;
  createdAt: string;
}

interface PhenotypeRow {
  photoId: string;
  className: string;
  count: number;
  avgConfidence: number;
  minConfidence: number;
  maxConfidence: number;
  nLow: number;
  nHigh: number;
  reviewed: boolean;
  createdAt: string;
}

interface QueryResult {
  rows: PhenotypeRow[];
  included: number;
  total: number;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function Tools() {
  const [className, setClassName] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<ToolCallLog[]>([]);
  const [callerFilter, setCallerFilter] = useState<"all" | "human" | "llm">(
    "all"
  );

  const loadHistory = async () => {
    try {
      const logs = await invoke<ToolCallLog[]>("list_tool_calls", {
        caller: callerFilter === "all" ? null : callerFilter,
        limit: 50,
      });
      setHistory(logs);
    } catch (e) {
      console.error("加载历史失败:", e);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [callerFilter]);

  const runQuery = async () => {
    setRunning(true);
    setError(null);
    try {
      const args = className.trim() ? { className: className.trim() } : {};
      const res = await invoke<QueryResult>("invoke_tool", {
        toolName: "query_phenotypes",
        args,
      });
      setResult(res);
      await loadHistory();
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas">
      {/* 顶栏 */}
      <header className="flex shrink-0 items-center justify-between border-b border-divider-soft px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">工具调用</h1>
          <p className="text-xs text-ink-muted-48">
            人类与智能体共用同一套工具 · 每次调用可回溯 · 数据真相原样呈现
          </p>
        </div>
        <button
          onClick={loadHistory}
          className="flex items-center gap-1.5 rounded-lg bg-canvas-parchment px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-divider-soft"
        >
          <RefreshCw size={12} /> 刷新历史
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 左：人类调用 + 结果 */}
        <section className="flex w-1/2 flex-col overflow-y-auto border-r border-divider-soft px-6 py-5">
          <h2 className="mb-1 text-sm font-semibold text-ink">
            query_phenotypes
          </h2>
          <p className="mb-4 text-xs text-ink-muted-48">
            查询表型聚合（仅 confidence ≥ 0.5 的有效检测）。低于阈值的脏数据计入
            nLow，不静默丢弃。
          </p>

          <div className="mb-3 flex gap-2">
            <input
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="className（可选，如 pods）"
              className="flex-1 rounded-lg border border-divider-soft bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            />
            <button
              onClick={runQuery}
              disabled={running}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
            >
              <Play size={13} /> {running ? "调用中" : "调用"}
            </button>
          </div>

          {error && (
            <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}

          {result && (
            <div>
              <div className="mb-2 text-xs text-ink-muted-48">
                返回 {result.included} / 共 {result.total} 条
              </div>
              {result.rows.length === 0 ? (
                <p className="text-xs text-ink-muted-48">无匹配记录</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-ink-muted-48">
                      <th className="py-1.5 font-medium">类别</th>
                      <th className="font-medium">数量</th>
                      <th className="font-medium">平均置信</th>
                      <th className="font-medium">nLow</th>
                      <th className="font-medium">审核</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r, i) => (
                      <tr key={i} className="border-t border-divider-soft">
                        <td className="py-1.5 text-ink">{r.className}</td>
                        <td className="text-ink">{r.count}</td>
                        <td className="text-ink">{pct(r.avgConfidence)}</td>
                        <td
                          className={
                            r.nLow > 0 ? "text-yellow-600" : "text-ink-muted-48"
                          }
                        >
                          {r.nLow}
                        </td>
                        <td>
                          {r.reviewed ? (
                            <span className="inline-flex items-center gap-1 text-green-600">
                              <ShieldCheck size={11} /> 已审核
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-ink-muted-48">
                              <ShieldAlert size={11} /> 未审核
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>

        {/* 右：调用历史 */}
        <section className="flex w-1/2 flex-col overflow-hidden px-6 py-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">调用历史</h2>
            <div className="flex gap-1">
              {(["all", "human", "llm"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCallerFilter(c)}
                  className={`rounded-md px-2 py-1 text-xs transition-colors ${
                    callerFilter === c
                      ? "bg-primary text-white"
                      : "bg-canvas-parchment text-ink-muted-48"
                  }`}
                >
                  {c === "all" ? "全部" : c === "human" ? "👤 人类" : "🤖 智能体"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {history.length === 0 ? (
              <p className="text-xs text-ink-muted-48">暂无调用记录</p>
            ) : (
              <ul className="space-y-2">
                {history.map((log) => (
                  <ToolHistoryItem key={log.id} log={log} />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ToolHistoryItem({ log }: { log: ToolCallLog }) {
  const [expanded, setExpanded] = useState(false);
  const isHuman = log.caller === "human";

  let argsSummary = "{}";
  try {
    const parsed = JSON.parse(log.args);
    argsSummary = Object.keys(parsed).length ? log.args : "{}";
  } catch {
    argsSummary = log.args;
  }

  return (
    <li className="rounded-lg border border-divider-soft bg-white px-3 py-2">
      <button
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={isHuman ? "text-blue-500" : "text-purple-500"}>
          {isHuman ? <User size={13} /> : <Bot size={13} />}
        </span>
        <span className="text-xs font-medium text-ink">{log.toolName}</span>
        <span className="truncate text-xs text-ink-muted-48">{argsSummary}</span>
        <span
          className={`ml-auto text-[11px] ${
            log.status === "success" ? "text-green-600" : "text-red-600"
          }`}
        >
          {log.status}
        </span>
        <span className="text-[11px] text-ink-muted-48">
          {log.createdAt.slice(11)}
        </span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-1 break-all text-[11px] text-ink-muted-48">
          <div>
            <span className="text-ink">参数 </span>
            {log.args}
          </div>
          <div>
            <span className="text-ink">结果 </span>
            {log.result ?? log.error ?? "—"}
          </div>
        </div>
      )}
    </li>
  );
}
