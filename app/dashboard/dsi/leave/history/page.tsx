"use client";

import { formatDateDMY } from "@/lib/date-format";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/app/components/DataTable";
import { getToken } from "@/lib/auth-client";

type LeaveItem = {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  year: number | null;
  status: "SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  currentAssignee?: string;
  days: number;
};

function toUtcDay(value: string | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function daysBetweenInclusive(start: string, end: string) {
  const s = toUtcDay(start);
  const e = toUtcDay(end);
  if (s == null || e == null) return 0;
  if (e < s) return 0;
  return Math.floor((e - s) / 86400000) + 1;
}

function statusLabel(status: LeaveItem["status"]) {
  if (status === "APPROVED") return "Validée";
  if (status === "REJECTED") return "Refusée";
  if (status === "CANCELLED") return "Annulée";
  if (status === "SUBMITTED") return "Soumise";
  return "En attente";
}

function statusClass(status: LeaveItem["status"]) {
  if (status === "APPROVED") return "text-emerald-700";
  if (status === "REJECTED") return "text-red-600";
  if (status === "CANCELLED") return "text-gray-500";
  return "text-amber-700";
}

export default function DsiLeaveHistory() {
  const HISTORY_PAGE_SIZE = 120;
  const [items, setItems] = useState<LeaveItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [historyYearFilter, setHistoryYearFilter] = useState("CURRENT");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasNext, setHistoryHasNext] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const fetchFromRoutes = async (routes: string[]) => {
      for (const route of routes) {
        const res = await fetch(route, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) return { ok: true as const, data };
      }
      return { ok: false as const, data: {} };
    };

    const load = async () => {
      setIsLoading(true);
      try {
        const result = await fetchFromRoutes([
          `/api/leave-requests/history?mine=1&page=${historyPage}&take=${HISTORY_PAGE_SIZE}`,
          `/api/leaves/history?mine=1&page=${historyPage}&take=${HISTORY_PAGE_SIZE}`,
        ]);
        const data = result.data;
        if (result.ok) {
          const mapped = (data?.leaves ?? []).map((x: any) => {
              const startRaw = x.startDate ?? "";
              const endRaw = x.endDate ?? "";
              const startRawDate = startRaw ? new Date(startRaw) : null;
              const leaveYear =
                startRawDate && !Number.isNaN(startRawDate.getTime()) ? startRawDate.getUTCFullYear() : null;
              const start = formatDateDMY(startRaw);
              const end = formatDateDMY(endRaw);
              return {
                id: x.id,
                type: x.type,
                startDate: start,
                endDate: end,
                year: leaveYear,
                status: x.status,
                currentAssignee: x.currentAssignee
                  ? `${x.currentAssignee.firstName} ${x.currentAssignee.lastName}`
                  : "—",
                days: startRaw && endRaw ? daysBetweenInclusive(startRaw, endRaw) : 0,
              };
            });
          setItems(mapped);
          setHistoryHasNext(mapped.length === HISTORY_PAGE_SIZE);
        }
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [historyPage]);

  const historyYears = useMemo(
    () => Array.from(new Set(items.map((item) => item.year).filter((value): value is number => value != null))).sort((a, b) => b - a),
    [items]
  );

  const filteredItems = useMemo(() => {
    const currentYear = new Date().getUTCFullYear();
    if (historyYearFilter === "ALL") return items;
    if (historyYearFilter === "CURRENT") return items.filter((item) => item.year === currentYear);
    const selectedYear = Number(historyYearFilter);
    if (!Number.isInteger(selectedYear)) return items;
    return items.filter((item) => item.year === selectedYear);
  }, [items, historyYearFilter]);

  const columns = useMemo<ColumnDef<LeaveItem>[]>(
    () => [
      { header: "Type", accessorKey: "type" },
      {
        id: "period",
        header: "Période",
        accessorFn: (row) => `${row.startDate} - ${row.endDate}`,
        cell: ({ row }) => (
          <span>
            {row.original.startDate} - {row.original.endDate}
          </span>
        ),
      },
      { header: "Jours", accessorKey: "days" },
      {
        header: "Statut",
        accessorKey: "status",
        cell: ({ row }) => (
          <span className={`text-xs font-semibold ${statusClass(row.original.status)}`}>
            {statusLabel(row.original.status)}
          </span>
        ),
      },
      {
        header: "Assigné",
        accessorFn: (row) => row.currentAssignee ?? "—",
        cell: ({ row }) => row.original.currentAssignee ?? "—",
      },
    ],
    []
  );

  return (
    <div className="p-6">
      <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Historique de mes congés</div>
      <div className="text-sm text-vdm-gold-700 mb-4">Statuts : validé, refusé, en attente.</div>
      <div className="mb-3">
        <label className="text-sm text-vdm-gold-900">
          Filtrer par année
          <select
            value={historyYearFilter}
            onChange={(e) => setHistoryYearFilter(e.target.value)}
            className="mt-1 w-full sm:w-72 rounded-lg border border-vdm-gold-300 px-3 py-2 bg-white"
          >
            <option value="CURRENT">Année en cours</option>
            <option value="ALL">Toutes</option>
            {historyYears.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      <DataTable
        data={filteredItems}
        columns={columns}
        searchPlaceholder="Rechercher..."
        onRefresh={() => window.location.reload()}
      />
      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-vdm-gold-700">Page {historyPage}</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
            disabled={historyPage <= 1 || isLoading}
            className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50 disabled:opacity-60"
          >
            Précédent
          </button>
          <button
            type="button"
            onClick={() => setHistoryPage((p) => p + 1)}
            disabled={!historyHasNext || isLoading}
            className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50 disabled:opacity-60"
          >
            Suivant
          </button>
        </div>
      </div>
      {isLoading ? <div className="mt-3 text-xs text-vdm-gold-700">Chargement de l'historique...</div> : null}
    </div>
  );
}
