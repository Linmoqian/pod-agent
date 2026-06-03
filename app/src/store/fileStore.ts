import { create } from "zustand";

interface FileItem {
  id: string;
  name: string;
  type: string;
  size: string;
  time: string;
  icon: string;
  color: string;
}

interface FileManagerState {
  files: FileItem[];
  selectedFiles: string[];
  currentPath: string[];
  viewMode: "list" | "grid";
  searchQuery: string;
  selectFile: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  navigateTo: (path: string[]) => void;
  setViewMode: (mode: "list" | "grid") => void;
  setSearchQuery: (query: string) => void;
}

export const useFileManagerStore = create<FileManagerState>((set) => ({
  files: [
    { id: "1", name: "基因组数据", type: "文件夹", size: "-", time: "2026-06-01 14:30", icon: "folder", color: "#F59E0B" },
    { id: "2", name: "表型记录", type: "文件夹", size: "-", time: "2026-05-28 09:15", icon: "folder", color: "#F59E0B" },
    { id: "3", name: "育种方案.pdf", type: "PDF", size: "2.4 MB", time: "2026-05-25 16:42", icon: "file-text", color: "#EF4444" },
    { id: "4", name: "产量分析.xlsx", type: "Excel", size: "856 KB", time: "2026-05-20 11:08", icon: "file-spreadsheet", color: "#22C55E" },
    { id: "5", name: "田间照片", type: "文件夹", size: "-", time: "2026-05-18 08:20", icon: "folder", color: "#F59E0B" },
    { id: "6", name: "实验报告.docx", type: "Word", size: "1.2 MB", time: "2026-05-15 13:55", icon: "file-text", color: "#3B82F6" },
    { id: "7", name: "种子库清单.csv", type: "CSV", size: "45 KB", time: "2026-05-10 10:30", icon: "file-spreadsheet", color: "#22C55E" },
  ],
  selectedFiles: [],
  currentPath: ["全部文件", "育种数据", "2026年春季"],
  viewMode: "list",
  searchQuery: "",
  selectFile: (id) =>
    set((state) => ({
      selectedFiles: state.selectedFiles.includes(id)
        ? state.selectedFiles.filter((f) => f !== id)
        : [...state.selectedFiles, id],
    })),
  selectAll: () =>
    set((state) => ({
      selectedFiles: state.files.map((f) => f.id),
    })),
  clearSelection: () => set({ selectedFiles: [] }),
  navigateTo: (path) => set({ currentPath: path }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
