import { create } from "zustand";

interface ExcelState {
  selectedCell: string;
  formula: string;
  activeSheet: string;
  selectedRange: string[];
  selectCell: (cell: string) => void;
  setFormula: (formula: string) => void;
  setActiveSheet: (sheet: string) => void;
  selectRange: (cells: string[]) => void;
}

export const useExcelStore = create<ExcelState>((set) => ({
  selectedCell: "A1",
  formula: "=SUM(B2:B10)",
  activeSheet: "Sheet1",
  selectedRange: [],
  selectCell: (cell) => set({ selectedCell: cell }),
  setFormula: (formula) => set({ formula }),
  setActiveSheet: (sheet) => set({ activeSheet: sheet }),
  selectRange: (cells) => set({ selectedRange: cells }),
}));
