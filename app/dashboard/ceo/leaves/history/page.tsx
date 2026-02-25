"use client";
import { formatDateDMY } from "@/lib/date-format";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/app/components/DataTable";
import EmployeeAvatar from "@/app/components/EmployeeAvatar";
import { getToken } from "@/lib/auth-client";

type HistoryItem = {
  id: string;
  firstName: string;
  lastName: string;
  employeeName: string;
  profilePhotoUrl?: string | null;
  employeeRole: string;
  decidedBy: string;
  type: string;
  startDate: string;
  endDate: string;
  year: number | null;
  status: string;
  decidedAt: string;
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

function statusLabel(status: string) {
  if (status === "APPROVED") return "Validée";
  if (status === "REJECTED") return "Refusée";
  if (status === "CANCELLED") return "Annulée";
  if (status === "SUBMITTED") return "Soumise";
  if (status === "PENDING") return "En attente";
  return status;
}

function statusClass(status: string) {
  if (status === "APPROVED") return "text-emerald-700";
  if (status === "REJECTED") return "text-red-600";
  if (status === "CANCELLED") return "text-gray-500";
  return "text-amber-700";
}

export default function CeoLeavesHistory() {
  const HISTORY_PAGE_SIZE = 100;
  const currentYear = new Date().getUTCFullYear();
  const [rows, setRows] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [historyYearFilter, setHistoryYearFilter] = useState(String(currentYear));
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasNext, setHistoryHasNext] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/leave-requests/history?scope=all&page=${historyPage}&take=${HISTORY_PAGE_SIZE}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          const mapped = (data?.leaves ?? []).map((x: {
              id: string;
              type?: string;
              startDate?: string;
              endDate?: string;
              status?: string;
              employee?: { firstName?: string; lastName?: string; profilePhotoUrl?: string; role?: string } | null;
              decisions?: Array<{
                createdAt?: string;
                actor?: { firstName?: string; lastName?: string; role?: string } | null;
              }>;
            }) => {
              const startRaw = x.startDate ?? "";
              const endRaw = x.endDate ?? "";
              const startRawDate = startRaw ? new Date(startRaw) : null;
              const leaveYear =
                startRawDate && !Number.isNaN(startRawDate.getTime()) ? startRawDate.getUTCFullYear() : null;
              const start = formatDateDMY(startRaw);
              const end = formatDateDMY(endRaw);
              const emp = x.employee ?? {};

              // NB: si x.decisions est vide, decidedAt sera "-" (évite "Invalid Date")
              const decidedAtRaw = x.decisions?.[0]?.createdAt;
              const decidedAt = decidedAtRaw ? formatDateDMY(decidedAtRaw) : "-";
              const decidedBy =
                `${x.decisions?.[0]?.actor?.firstName ?? ""} ${x.decisions?.[0]?.actor?.lastName ?? ""}`.trim() ||
                x.decisions?.[0]?.actor?.role ||
                "-";

              return {
                id: x.id,
                firstName: emp.firstName ?? "",
                lastName: emp.lastName ?? "",
                employeeName: `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim() || "—",
                profilePhotoUrl: emp.profilePhotoUrl ?? null,
                employeeRole: emp.role ?? "—",
                decidedBy,
                type: x.type ?? "—",
                startDate: start,
                endDate: end,
                year: leaveYear,
                status: x.status ?? "—",
                decidedAt,
                days: startRaw && endRaw ? daysBetweenInclusive(startRaw, endRaw) : 0,
              };
            });
          setRows(mapped);
          setHistoryHasNext(mapped.length === HISTORY_PAGE_SIZE);
        }
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [historyPage]);

  const historyYears = useMemo(
    () => Array.from(new Set(rows.map((item) => item.year).filter((value): value is number => value != null))).sort((a, b) => b - a),
    [rows]
  );

  const filteredRows = useMemo(() => {
    if (historyYearFilter === "ALL") return rows;
    const selectedYear = Number(historyYearFilter);
    if (!Number.isInteger(selectedYear)) return rows;
    return rows.filter((item) => item.year === selectedYear);
  }, [rows, historyYearFilter]);

  const columns = useMemo<ColumnDef<HistoryItem>[]>(
    () => [
      {
        header: "Employé",
        accessorKey: "employeeName",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <EmployeeAvatar
              firstName={row.original.firstName}
              lastName={row.original.lastName}
              profilePhotoUrl={row.original.profilePhotoUrl}
            />
            <div>
              <div className="font-semibold">{row.original.employeeName}</div>
              <div className="text-xs text-vdm-gold-700">{row.original.employeeRole}</div>
            </div>
          </div>
        ),
      },
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
      { header: "Decide par", accessorKey: "decidedBy" },
      { header: "Décision", accessorKey: "decidedAt" },
    ],
    []
  );

  return (
    <div className="p-6">
      <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Historique global des congés</div>
      <div className="text-sm text-vdm-gold-700 mb-4">Toutes les demandes traitées par l&apos;entreprise.</div>
      <div className="mb-3">
        <label className="text-sm text-vdm-gold-900">
          Filtrer par année
          <select
            value={historyYearFilter}
            onChange={(e) => setHistoryYearFilter(e.target.value)}
            className="mt-1 w-full sm:w-72 rounded-lg border border-vdm-gold-300 px-3 py-2 bg-white"
          >
            <option value={String(currentYear)}>Année en cours ({currentYear})</option>
            <option value="ALL">Toutes</option>
            {historyYears
              .filter((y) => y !== currentYear)
              .map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
          </select>
        </label>
      </div>

      <DataTable
        data={filteredRows}
        columns={columns}
        searchPlaceholder="Rechercher un employé..."
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

      {isLoading ? <div className="mt-3 text-xs text-vdm-gold-700">Chargement de l&apos;historique...</div> : null}
    </div>
  );
}
