"use client";

import { formatDateDMY } from "@/lib/date-format";
import { getToken } from "@/lib/auth-client";
import DataTable from "@/app/components/DataTable";
import toast from "react-hot-toast";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

type LeaveItem = {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  status: "SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  currentAssignee?: string;
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
};

type ApiLeave = {
  id: string;
  type: string;
  startDate?: string;
  endDate?: string;
  status: LeaveItem["status"] | HistoryItem["status"];
  currentAssignee?: { firstName?: string; lastName?: string } | null;
  decisions?: Array<{
    createdAt?: string;
  }>;
};

type Props = {
  title: string;
  subtitle: string;
  activeRoutes: string[];
  historyRoutes: string[];
  historyTitle?: string;
  historySubtitle?: string;
  allowCancellation?: boolean;
  historyPageSize?: number;
  activeSearchPlaceholder?: string;
  historySearchPlaceholder?: string;
  activeErrorMessage?: string;
  historyErrorMessage?: string;
  historyAdapter?: (data: any) => HistoryItem[];
};

const DEFAULT_HISTORY_PAGE_SIZE = 120;

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

const defaultHistoryAdapter = (data: any): HistoryItem[] => {
  return (Array.isArray(data?.leaves) ? data.leaves : []).map((x: ApiLeave) => {
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
      status: x.status as HistoryItem["status"],
      decidedAt: x.decisions?.[0]?.createdAt ? formatDateDMY(x.decisions?.[0]?.createdAt) : "-",
      days: startRaw && endRaw ? daysBetweenInclusive(startRaw, endRaw) : 0,
    };
  });
};

export default function LeaveHistoryTables({
  title,
  subtitle,
  historyTitle,
  historySubtitle,
  activeRoutes,
  historyRoutes,
  historyPageSize,
  allowCancellation,
  activeSearchPlaceholder,
  historySearchPlaceholder,
  activeErrorMessage,
  historyErrorMessage,
  historyAdapter,
}: Props) {
  const [items, setItems] = useState<LeaveItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeStatusFilter] = useState("ALL");
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyStatusFilter, setHistoryStatusFilter] = useState("ALL");
  const [historyYearFilter, setHistoryYearFilter] = useState("ALL");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasNext, setHistoryHasNext] = useState(false);

  const resolvedHistoryTitle = historyTitle ?? "Historique";
  const resolvedHistorySubtitle = historySubtitle ?? "Historique complet de mes demandes.";
  const resolvedHistoryPageSize = typeof historyPageSize === "number" ? historyPageSize : DEFAULT_HISTORY_PAGE_SIZE;
  const resolvedAllowCancellation = allowCancellation ?? true;
  const resolvedActiveSearchPlaceholder = activeSearchPlaceholder ?? "Rechercher une demande...";
  const resolvedHistorySearchPlaceholder = historySearchPlaceholder ?? "Rechercher une demande...";
  const resolvedActiveErrorMessage =
    activeErrorMessage ?? "Impossible de charger les demandes en cours.";
  const resolvedHistoryErrorMessage =
    historyErrorMessage ?? "Impossible de charger l'historique des demandes.";
  const historyMapper = useMemo(() => historyAdapter ?? defaultHistoryAdapter, [historyAdapter]);
  const activeRoutesKey = activeRoutes.join("|");
  const historyRoutesKey = historyRoutes.join("|");

  const fetchFromRoutes = useCallback(async (routes: string[], token: string) => {
    for (const route of routes) {
      try {
        const res = await fetch(route, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          return { ok: true as const, data };
        }
      } catch {
        /* ignore individual errors */
      }
    }
    return { ok: false as const, data: {} };
  }, []);

  const loadActive = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setIsLoading(true);
    try {
      const result = await fetchFromRoutes(activeRoutes, token);
      if (!result.ok) {
        toast.error(resolvedActiveErrorMessage);
        return;
      }
      const data = result.data;
      setItems(
        (data?.leaves ?? []).map((x: ApiLeave) => ({
          id: x.id,
          type: x.type,
          startDate: formatDateDMY(x.startDate),
          endDate: formatDateDMY(x.endDate),
          status: x.status,
          currentAssignee: x.currentAssignee
            ? `${x.currentAssignee.firstName ?? ""} ${x.currentAssignee.lastName ?? ""}`.trim()
            : "-",
        }))
      );
    } finally {
      setIsLoading(false);
    }
  }, [activeRoutes, fetchFromRoutes, resolvedActiveErrorMessage]);

  const addPagingParams = useCallback(
    (route: string) => {
      const separator = route.includes("?") ? "&" : "?";
      return `${route}${separator}page=${historyPage}&take=${resolvedHistoryPageSize}`;
    },
    [historyPage, resolvedHistoryPageSize]
  );

  const loadHistory = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setIsHistoryLoading(true);
    try {
      const pagedRoutes = historyRoutes.map(addPagingParams);
      const result = await fetchFromRoutes(pagedRoutes, token);
      if (!result.ok) {
        toast.error(resolvedHistoryErrorMessage);
        return;
      }
      const data = result.data;
      const mapped = historyMapper(data);
      setHistoryItems(mapped);
      setHistoryHasNext(mapped.length === resolvedHistoryPageSize);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [addPagingParams, fetchFromRoutes, historyRoutes, historyMapper, resolvedHistoryErrorMessage, resolvedHistoryPageSize]);

  useEffect(() => {
    void loadActive();
  }, [loadActive, activeRoutesKey]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory, historyRoutesKey, historyPage]);

  const activeItems = useMemo(
    () => items.filter((item) => ["SUBMITTED", "PENDING"].includes(item.status)),
    [items]
  );

  const filteredActiveItems = useMemo(() => {
    if (activeStatusFilter === "ALL") return activeItems;
    return activeItems.filter((item) => item.status === activeStatusFilter);
  }, [activeItems, activeStatusFilter]);

  const historyYears = useMemo(
    () =>
      Array.from(
        new Set(historyItems.map((item) => item.year).filter((value): value is number => value != null))
      ).sort((a, b) => b - a),
    [historyItems]
  );

  const filteredHistoryItems = useMemo(() => {
    let itemsByYear = historyItems;
    if (historyYearFilter !== "ALL") {
      const selectedYear = Number(historyYearFilter);
      if (Number.isInteger(selectedYear)) {
        itemsByYear = itemsByYear.filter((item) => item.year === selectedYear);
      }
    }
    if (historyStatusFilter === "ALL") return itemsByYear;
    return itemsByYear.filter((item) => item.status === historyStatusFilter);
  }, [historyItems, historyStatusFilter, historyYearFilter]);

  const cancelRequest = useCallback(
    async (id: string) => {
      if (!resolvedAllowCancellation) return;
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
    },
    [resolvedAllowCancellation]
  );

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
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          if (!resolvedAllowCancellation) return "-";
          if (!["SUBMITTED", "PENDING"].includes(row.original.status)) return "-";
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
    [cancelRequest, resolvedAllowCancellation]
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
    []
  );

  return (
    <div className="p-6">
      <div className="text-xl font-semibold mb-1 text-vdm-gold-800">{title}</div>
      <div className="text-sm text-vdm-gold-700 mb-4">{subtitle}</div>

      <DataTable
        data={filteredActiveItems}
        columns={columns}
        searchPlaceholder={resolvedActiveSearchPlaceholder}
        onRefresh={() => window.location.reload()}
      />
      {isLoading ? <div className="mt-3 text-xs text-vdm-gold-700">Chargement des demandes...</div> : null}

      <div className="mt-8">
        <div className="text-lg font-semibold mb-1 text-vdm-gold-800">{resolvedHistoryTitle}</div>
        <div className="text-sm text-vdm-gold-700 mb-4">{resolvedHistorySubtitle}</div>

        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-vdm-gold-700">Filtrer par statut</div>
          <select
            value={historyStatusFilter}
            onChange={(e) => setHistoryStatusFilter(e.target.value)}
            className="w-full sm:w-56 rounded-md border border-vdm-gold-200 bg-white px-3 py-2 text-sm text-vdm-gold-900 focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
          >
            <option value="ALL">Tous</option>
            <option value="APPROVED">Validée</option>
            <option value="REJECTED">Refusée</option>
            <option value="CANCELLED">Annulée</option>
          </select>
        </div>

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
          searchPlaceholder={resolvedHistorySearchPlaceholder}
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
