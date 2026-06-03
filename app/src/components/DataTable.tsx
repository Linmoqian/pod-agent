interface Column {
  key: string;
  label: string;
  width?: number;
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
}

interface DataTableProps {
  columns: Column[];
  data: Record<string, unknown>[];
  onRowClick?: (row: Record<string, unknown>) => void;
  selectedRowId?: string;
}

export default function DataTable({ columns, data, onRowClick, selectedRowId }: DataTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
      <table className="w-full">
        <thead>
          <tr className="bg-[#F9FAFB] text-[12px] font-medium text-[#6B7280]">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-3.5 py-2.5 text-left"
                style={col.width ? { width: col.width } : undefined}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={String(row.id || i)}
              className={`border-t border-[#F3F4F6] text-[12px] ${
                selectedRowId === row.id ? "bg-[#EFF6FF]" : ""
              } ${onRowClick ? "cursor-pointer hover:bg-[#F8FAFC]" : ""}`}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-3.5 py-2.5 text-[#374151]">
                  {col.render
                    ? col.render(row[col.key], row)
                    : String(row[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
