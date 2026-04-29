"use client";
import { formatDateDMY } from "@/lib/date-format";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/app/components/DataTable";
import { getToken } from "@/lib/auth-client";
import toast from "react-hot-toast";
import { countLeaveDaysInclusive } from "@/lib/leave-days";

type LeaveItem = {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  status: "SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  currentAssignee?: string;
  justificationFileName?: string | null;
  justificationMimeType?: string | null;
};

type HistoryItem = {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  year: number | null;
  status: "APPROVED" | "REJECTED" | "CANCELLED";
  decidedAt: string;
  days: number;
  justificationFileName?: string | null;
  justificationMimeType?: string | null;
};

function statusLabel(status: LeaveItem["status"] | HistoryItem["status"]) {
  if (status === "APPROVED") return "Validée";
  if (status === "REJECTED") return "Refusée";
  if (status === "CANCELLED") return "Annulée";
  if (status === "SUBMITTED") return "Soumise";
  return "En attente";
}

function statusClass(status: LeaveItem["status"] | HistoryItem["status"]) {
  if (status === "APPROVED") return "text-emerald-700";
  if (status === "REJECTED") return "text-red-600";
  if (status === "CANCELLED") return "text-gray-500";
  return "text-amber-700";
}

export default function EmployeeRequests() {
  const HISTORY_PAGE_SIZE = 120;
  const [items, setItems] = useState<LeaveItem[]>([]);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const currentYear = new Date().getUTCFullYear();
  const [historyYearFilter, setHistoryYearFilter] = useState(String(currentYear));
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasNext, setHistoryHasNext] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/leave-requests/my", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setItems(
            (data?.leaves ?? []).map((x: any) => ({
              id: x.id,
              type: x.type,
              startDate: formatDateDMY(x.startDate),
              endDate: formatDateDMY(x.endDate),
              status: x.status,
              currentAssignee: x.currentAssignee
                ? `${x.currentAssignee.firstName} ${x.currentAssignee.lastName}`
                : "-",
              justificationFileName: x.justificationFileName ?? null,
              justificationMimeType: x.justificationMimeType ?? null,
            }))
          );
        }
      } finally {
        setIsLoading(false);
      }
    };
    load();

    const loadHistory = async () => {
      setIsHistoryLoading(true);
      try {
        const res = await fetch(`/api/leave-requests/history?mine=1&page=${historyPage}&take=${HISTORY_PAGE_SIZE}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
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
                decidedAt: formatDateDMY(x.decisions?.[0]?.createdAt),
                days:
                  startRaw && endRaw
                    ? countLeaveDaysInclusive({ start: startRaw, end: endRaw, type: x.type })
                    : 0,
                justificationFileName: x.justificationFileName ?? null,
                justificationMimeType: x.justificationMimeType ?? null,
              };
            });
          setHistoryItems(mapped);
          setHistoryHasNext(mapped.length === HISTORY_PAGE_SIZE);
        }
      } finally {
        setIsHistoryLoading(false);
      }
    };
    loadHistory();
  }, [historyPage]);

  const activeItems = useMemo(
    () => items.filter((item) => ["SUBMITTED", "PENDING"].includes(item.status)),
    [items]
  );
  const historyYears = useMemo(() => {
    const yearSet = new Set<number>();
    for (const item of historyItems) {
      if (item.year != null) {
        yearSet.add(item.year);
      }
    }
    yearSet.add(currentYear);
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [historyItems, currentYear]);

  const filteredHistoryItems = useMemo(() => {
    if (historyYearFilter === "ALL") return historyItems;
    const selectedYear = Number(historyYearFilter);
    if (!Number.isInteger(selectedYear)) return historyItems;
    return historyItems.filter((item) => item.year === selectedYear);
  }, [historyItems, historyYearFilter]);

  const cancelRequest = async (id: string) => {
    const token = getToken();
    if (!token) return;
    const t = toast.loading("Annulation en cours...");
    try {
      const res = await fetch(`/api/leave-requests/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        toast.error("Erreur lors de l'annulation.", { id: t });
        return;
      }
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, status: "CANCELLED" } : x)));
      toast.success("Demande annulée.", { id: t });
    } catch {
      toast.error("Erreur réseau lors de l'annulation.", { id: t });
    }
  };

  const openJustification = useCallback(async (id: string, fileName?: string | null) => {
    const token = getToken();
    if (!token) return;
    const t = toast.loading("Ouverture du justificatif...");
    try {
      const res = await fetch(`/api/leave-requests/${id}/justification`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(String(data?.error ?? "Impossible d'ouvrir le justificatif"), { id: t });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success(fileName ? `Justificatif : ${fileName}` : "Justificatif ouvert", { id: t });
    } catch {
      toast.error("Erreur réseau lors de l'ouverture du justificatif", { id: t });
    }
  }, []);

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
        accessorFn: (row) => row.currentAssignee ?? "-",
        cell: ({ row }) => row.original.currentAssignee ?? "-",
      },
      {
        header: "Justificatif",
        accessorKey: "justificationFileName",
        cell: ({ row }) =>
          row.original.justificationFileName ? (
            <button
              type="button"
              onClick={() => openJustification(row.original.id, row.original.justificationFileName)}
              className="px-2 py-1 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
            >
              Voir
            </button>
          ) : (
            "—"
          ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          if (!["SUBMITTED", "PENDING"].includes(row.original.status)) return "—";
          return (
            <button
              onClick={() => cancelRequest(row.original.id)}
              className="px-2 py-1 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
            >
              Annuler
            </button>
          );
        },
      },
    ],
    [openJustification]
  );

  const historyColumns = useMemo<ColumnDef<HistoryItem>[]>(
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
        header: "Justificatif",
        accessorKey: "justificationFileName",
        cell: ({ row }) =>
          row.original.justificationFileName ? (
            <button
              type="button"
              onClick={() => openJustification(row.original.id, row.original.justificationFileName)}
              className="px-2 py-1 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
            >
              Voir
            </button>
          ) : (
            "—"
          ),
      },
      {
        header: "Statut",
        accessorKey: "status",
        cell: ({ row }) => (
          <span className={`text-xs font-semibold ${statusClass(row.original.status)}`}>
            {statusLabel(row.original.status)}
          </span>
        ),
      },
      { header: "Décision", accessorKey: "decidedAt" },
    ],
    [openJustification]
  );

  return (
    <div className="p-6">
      <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Mes demandes</div>
      <div className="text-sm text-vdm-gold-700 mb-4">
        Suivez l'état de vos demandes en cours de traitement.
      </div>

      <DataTable
        data={activeItems}
        columns={columns}
        searchPlaceholder="Rechercher une demande..."
        onRefresh={() => window.location.reload()}
      />
      {isLoading ? (
        <div className="mt-3 text-xs text-vdm-gold-700">Chargement des demandes...</div>
      ) : null}

      <div className="mt-8">
        <div className="text-lg font-semibold mb-1 text-vdm-gold-800">Historique</div>
        <div className="text-sm text-vdm-gold-700 mb-4">Demandes traitées, filtrables par année.</div>

        <div className="mb-3">
          <label className="text-sm text-vdm-gold-900">
            Filtrer par année
            <select
              value={historyYearFilter}
              onChange={(e) => setHistoryYearFilter(e.target.value)}
              className="mt-1 w-full sm:w-72 rounded-lg border border-vdm-gold-300 px-3 py-2 bg-white"
            >
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
          data={filteredHistoryItems}
          columns={historyColumns}
          searchPlaceholder="Rechercher une demande..."
          onRefresh={() => window.location.reload()}
        />
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-vdm-gold-700">Page {historyPage}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
              disabled={historyPage <= 1 || isHistoryLoading}
              className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50 disabled:opacity-60"
            >
              Précédent
            </button>
            <button
              type="button"
              onClick={() => setHistoryPage((p) => p + 1)}
              disabled={!historyHasNext || isHistoryLoading}
              className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50 disabled:opacity-60"
            >
              Suivant
            </button>
          </div>
        </div>
        {isHistoryLoading ? (
          <div className="mt-3 text-xs text-vdm-gold-700">Chargement de l'historique...</div>
        ) : null}
      </div>
    </div>
  );
}
