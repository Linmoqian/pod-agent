import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface PhenotypeItem {
  width: number;
  height: number;
  area: number;
  confidence: number;
}

export interface PhenotypeRecord {
  id: string;
  photoId: string;
  className: string;
  count: number;
  avgConfidence: number;
  minConfidence: number;
  maxConfidence: number;
  items: PhenotypeItem[];
  createdAt: string;
}

interface PhenotypePanelProps {
  photoId: string;
}

export default function PhenotypePanel({ photoId }: PhenotypePanelProps) {
  const [records, setRecords] = useState<PhenotypeRecord[]>([]);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);

  useEffect(() => {
    setRecords([]);
    setExpandedClass(null);
    invoke<PhenotypeRecord[]>("get_phenotypes", { photoId })
      .then(setRecords)
      .catch(() => {});
  }, [photoId]);

  if (records.length === 0) return null;

  const totalCount = records.reduce((sum, r) => sum + r.count, 0);

  return (
    <div
      className="flex h-full w-72 shrink-0 flex-col overflow-y-auto bg-black/80 px-4 py-5 text-white"
      onClick={(e) => e.stopPropagation()}
    >
      <h3 className="mb-4 text-sm font-semibold tracking-wide text-white/90">
        表型统计
      </h3>

      {/* 总计 */}
      <div className="mb-4 rounded-lg bg-white/10 px-3 py-2">
        <span className="text-xs text-white/60">检测目标总数</span>
        <span className="ml-2 text-lg font-semibold text-white">{totalCount}</span>
      </div>

      {/* 按类别分组 */}
      {records.map((record) => {
        const isExpanded = expandedClass === record.className;
        return (
          <div key={record.id} className="mb-3">
            <button
              className="flex w-full items-center justify-between rounded-lg bg-white/[0.07] px-3 py-2 text-left transition-colors hover:bg-white/[0.12]"
              onClick={() => setExpandedClass(isExpanded ? null : record.className)}
            >
              <div>
                <span className="text-sm font-medium text-white/90">{record.className}</span>
                <span className="ml-2 text-xs text-white/50">{record.count} 个</span>
              </div>
              <span className="text-xs text-white/50">
                {Math.round(record.avgConfidence * 100)}%
              </span>
            </button>

            {/* 展开详情 */}
            {isExpanded && (
              <div className="mt-1.5 space-y-1 pl-1">
                {/* 置信度统计 */}
                <div className="flex gap-3 px-2 py-1 text-[11px] text-white/50">
                  <span>最低 {Math.round(record.minConfidence * 100)}%</span>
                  <span>平均 {Math.round(record.avgConfidence * 100)}%</span>
                  <span>最高 {Math.round(record.maxConfidence * 100)}%</span>
                </div>

                {/* 每个目标 */}
                {record.items.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md bg-white/[0.04] px-2.5 py-1.5 text-xs"
                  >
                    <span className="text-white/60">#{i + 1}</span>
                    <span className="text-white/70">
                      {item.width.toFixed(1)} × {item.height.toFixed(1)}
                    </span>
                    <span className="text-white/50">{item.area.toFixed(0)} px²</span>
                    <span className="text-white/50">{Math.round(item.confidence * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
