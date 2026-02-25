"use client";

import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";

export default function DataTable<TData>({
  data,
  columns,
  searchPlaceholder = "Rechercher...",
  pageSize = 10,
  onRefresh,
}: {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  searchPlaceholder?: string;
  pageSize?: number;
  onRefresh?: () => void;
}) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize },
    },
  });

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;
  const canPrev = table.getCanPreviousPage();
  const canNext = table.getCanNextPage();

  const totalRows = table.getFilteredRowModel().rows.length;
  const pageIndex = table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();

  const emptyState = useMemo(() => totalRows === 0, [totalRows]);
  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await Promise.resolve(onRefresh());
        return;
      }
      if (typeof window !== "undefined") window.location.reload();
    } finally {
      setIsRefreshing(false);
    }
  };


  return (
    <div className="bg-white border border-vdm-gold-200 rounded-xl overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border-b border-vdm-gold-100 bg-vdm-gold-50">
        <input
          value={globalFilter ?? ""}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full sm:max-w-xs rounded-md border border-vdm-gold-200 bg-white px-3 py-2 text-sm text-vdm-gold-900 focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
        />
        <div className="flex items-center gap-2">
          <div className="text-xs text-vdm-gold-700">
            {totalRows} résultat{totalRows > 1 ? "s" : ""}
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-2 py-1 rounded-md border border-vdm-gold-300 text-xs text-vdm-gold-800 hover:bg-vdm-gold-50"
          >
            {isRefreshing ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border-2 border-vdm-gold-700 border-t-transparent animate-spin" />
                Chargement...
              </span>
            ) : (
              "Rafraichir"
            )}
          </button>
        </div>

      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-white">
            {headerGroups.map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-vdm-gold-100">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-left text-xs font-semibold text-vdm-gold-800"
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                          className={`inline-flex items-center gap-1 ${canSort ? "cursor-pointer" : "cursor-default"}`}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortDir === "asc" ? "▲" : sortDir === "desc" ? "▼" : ""}
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {emptyState ? (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-vdm-gold-700" colSpan={columns.length}>
                  Aucun résultat.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-vdm-gold-100 last:border-b-0">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-vdm-gold-900">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-3 bg-white">
        <div className="text-xs text-vdm-gold-700">
          Page {pageIndex + 1} sur {pageCount || 1}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!canPrev}
            className="px-3 py-1 rounded-md border border-vdm-gold-300 text-xs text-vdm-gold-800 disabled:opacity-40"
          >
            Précédent
          </button>
          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!canNext}
            className="px-3 py-1 rounded-md border border-vdm-gold-300 text-xs text-vdm-gold-800 disabled:opacity-40"
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}
