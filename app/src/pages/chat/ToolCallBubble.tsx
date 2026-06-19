import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench } from "lucide-react";
import type { ChatMessage } from "../../store";

interface ToolCallInfo {
  function?: { name?: string; arguments?: unknown };
}

export default function ToolCallBubble({ msg }: { msg: ChatMessage }) {
  const [expanded, setExpanded] = useState(false);

  let info: ToolCallInfo = {};
  try {
    const parsed = JSON.parse(msg.tool_calls || "[]");
    info = Array.isArray(parsed) ? parsed[0] ?? {} : {};
  } catch {
    /* 保持空 */
  }
  const name = info.function?.name ?? "工具";
  const args = info.function?.arguments;
  const running = !msg.content;
  let resultParsed: unknown = null;
  try {
    resultParsed = msg.content ? JSON.parse(msg.content) : null;
  } catch {
    resultParsed = msg.content;
  }

  return (
    <div className="mb-4 flex gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#10B981] text-white">
        <Wrench size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="rounded-lg border border-[#E5E7EB] bg-[#F0FDF4]">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-[#374151] hover:text-[#111827]"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="font-mono">{name}</span>
            <span className="text-[#6B7280]">
              {running ? "调用中…" : "✓ 完成"}
            </span>
          </button>
          {expanded && (
            <div className="space-y-2 border-t border-[#E5E7EB] px-3 py-2 text-[12px]">
              <div>
                <div className="mb-0.5 text-[#9CA3AF]">参数</div>
                <pre className="overflow-auto whitespace-pre-wrap break-all font-mono text-[#374151]">
                  {JSON.stringify(args, null, 2)}
                </pre>
              </div>
              {!running && (
                <div>
                  <div className="mb-0.5 text-[#9CA3AF]">结果</div>
                  <pre className="overflow-auto whitespace-pre-wrap break-all font-mono text-[#374151]">
                    {JSON.stringify(resultParsed, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
