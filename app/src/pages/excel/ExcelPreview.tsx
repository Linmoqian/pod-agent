import { useState } from "react";
import { useExcelStore } from "../../store";
import { Undo2, Redo2, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, PaintBucket, Grid3x3, SquareStack, ListFilter, ArrowUpDown, BarChart3, Plus } from "lucide-react";

const cols = ["A", "B", "C", "D", "E", "F", "G"];
const colWidths = [160, 120, 120, 120, 120, 120, 120];
const dataRows = [
  ["水稻-粳稻9号", "AA", "高抗", "680", "105", "135", "推荐种植"],
  ["水稻-籼稻12号", "AB", "中抗", "620", "112", "128", "需观察"],
  ["小麦-鲁麦15", "BB", "高抗", "520", "85", "210", "稳定品种"],
  ["小麦-济麦22", "AA", "感病", "480", "78", "205", "注意防治"],
  ["玉米-郑单958", "AB", "中抗", "650", "245", "120", "高产"],
  ["玉米-先玉335", "AA", "高抗", "700", "260", "125", "优质"],
  ["大豆-中黄13", "BB", "中抗", "180", "75", "100", "蛋白高"],
  ["大豆-合丰50", "AA", "高抗", "200", "80", "95", "推荐"],
  ["水稻-南粳46", "AB", "感病", "590", "108", "130", "口感好"],
  ["小麦-西农979", "BB", "中抗", "510", "82", "215", "耐旱"],
  ["玉米-登海605", "AA", "高抗", "720", "255", "118", "紧凑型"],
  ["大豆-黑河43", "AB", "高抗", "190", "70", "105", "早熟"],
];

const toolbarGroups = [
  [Undo2, Redo2],
  [Bold, Italic, Underline],
  [AlignLeft, AlignCenter, AlignRight],
  [PaintBucket, Grid3x3],
  [SquareStack],
  [ListFilter, ArrowUpDown],
  [BarChart3],
];

const sheets = ["Sheet1", "Sheet2", "Sheet3"];

export default function ExcelPreview() {
  const { selectedCell, formula, activeSheet, selectCell, setFormula, setActiveSheet } = useExcelStore();

  const [editFormula, setEditFormula] = useState(false);
  const [tempFormula, setTempFormula] = useState(formula);

  const handleCellClick = (cell: string) => {
    selectCell(cell);
  };

  const handleFormulaSubmit = () => {
    setFormula(tempFormula);
    setEditFormula(false);
  };

  const handleFormulaKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleFormulaSubmit();
    } else if (e.key === "Escape") {
      setTempFormula(formula);
      setEditFormula(false);
    }
  };

  const getCellId = (row: number, col: number) => `${cols[col]}${row + 1}`;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Menu Bar */}
      <div className="flex items-center gap-4 border-b border-[#E5E7EB] bg-[#F8F9FA] px-4 py-1.5">
        {["文件", "编辑", "视图", "插入", "格式", "数据", "工具"].map((m) => (
          <button key={m} className="text-[13px] text-[#374151] hover:bg-[#E5E7EB] hover:text-[#111827] px-2 py-1 rounded">
            {m}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-[#E5E7EB] bg-white px-4 py-2">
        {toolbarGroups.map((group, gi) => (
          <div key={gi} className="flex items-center">
            {gi > 0 && <div className="mx-1 h-6 w-px bg-[#E5E7EB]" />}
            {group.map((Icon, ii) => (
              <button key={ii} className="flex h-7 w-8 items-center justify-center rounded hover:bg-[#F3F4F6]">
                <Icon size={16} className="text-[#4B5563]" />
              </button>
            ))}
          </div>
        ))}
        <div className="mx-1 h-6 w-px bg-[#E5E7EB]" />
        <div className="flex items-center gap-1 rounded bg-[#F3F4F6] px-2 py-1">
          <span className="text-[12px] text-[#374151]">Inter</span>
          <svg className="h-3 w-3 text-[#6B7280]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
        <div className="flex items-center rounded bg-[#F3F4F6] px-2 py-1">
          <span className="w-[30px] text-center text-[12px] text-[#374151]">11</span>
        </div>
      </div>

      {/* Formula Bar */}
      <div className="flex items-center gap-2 border-b border-[#E5E7EB] px-2 py-1.5">
        <div className="flex items-center justify-center rounded bg-[#F3F4F6] px-2.5 py-1 font-mono text-[12px] font-medium text-[#374151]">
          {selectedCell}
        </div>
        <svg className="h-4 w-4 text-[#6B7280]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM17 14v6M14 17h6" />
        </svg>
        <div
          className="flex flex-1 items-center rounded border border-[#D1D5DB] bg-white px-2.5 py-1 cursor-text"
          onClick={() => setEditFormula(true)}
        >
          {editFormula ? (
            <input
              type="text"
              value={tempFormula}
              onChange={(e) => setTempFormula(e.target.value)}
              onKeyDown={handleFormulaKeyDown}
              onBlur={handleFormulaSubmit}
              className="w-full bg-transparent font-mono text-[12px] text-[#374151] outline-none"
              autoFocus
            />
          ) : (
            <span className="font-mono text-[12px] text-[#374151]">{formula}</span>
          )}
        </div>
      </div>

      {/* Spreadsheet */}
      <div className="flex flex-1 overflow-hidden">
        {/* Row Header */}
        <div className="w-10 flex-shrink-0 border-r border-[#E5E7EB] bg-[#F8F9FA]">
          <div className="flex h-8 items-center justify-center border-b border-[#E5E7EB]" />
          {Array.from({ length: 13 }).map((_, i) => (
            <div key={i} className="flex h-7 items-center justify-center border-b border-[#F1F5F9]">
              <span className="font-mono text-[11px] text-[#6B7280]">{i + 1}</span>
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex flex-1 flex-col overflow-auto">
          {/* Column Header */}
          <div className="flex h-8 flex-shrink-0 border-b border-[#E5E7EB] bg-[#F8F9FA]">
            {cols.map((c, i) => (
              <div key={c} className="flex items-center justify-center" style={{ width: colWidths[i] }}>
                <span className="font-mono text-[11px] font-medium text-[#6B7280]">{c}</span>
              </div>
            ))}
          </div>

          {/* Data Rows */}
          {dataRows.map((row, ri) => (
            <div key={ri} className="flex border-b border-[#E5E7EB]">
              {row.map((cell, ci) => {
                const cellId = getCellId(ri, ci);
                const isSelected = selectedCell === cellId;
                return (
                  <div
                    key={ci}
                    className={`flex h-7 cursor-pointer items-center px-2 transition-colors ${
                      isSelected ? "bg-[#E3F2FD] ring-2 ring-[#3B82F6] ring-inset" : "hover:bg-[#F8FAFC]"
                    }`}
                    style={{ width: colWidths[ci] }}
                    onClick={() => handleCellClick(cellId)}
                  >
                    <span className={`truncate text-[12px] ${ri === 0 ? "font-semibold text-[#111827]" : "text-[#374151]"}`}>
                      {cell}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between border-t border-[#E5E7EB] bg-[#F8F9FA] px-4 py-2">
        <div className="flex items-center gap-1">
          {sheets.map((s) => (
            <button
              key={s}
              onClick={() => setActiveSheet(s)}
              className={`rounded px-3 py-1 text-[12px] transition-colors ${
                activeSheet === s ? "border border-[#D1D5DB] bg-white text-[#111827]" : "text-[#6B7280] hover:bg-[#E5E7EB]"
              }`}
            >
              {s}
            </button>
          ))}
          <button className="flex h-6 w-7 items-center justify-center rounded text-[#6B7280] hover:bg-[#E5E7EB]">
            <Plus size={14} />
          </button>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-[#6B7280]">
          <span>行: 12 列: 7</span>
          <span>平均值: 458.3</span>
          <span>求和: 5499.6</span>
          <span>计数: 84</span>
        </div>
      </div>
    </div>
  );
}
