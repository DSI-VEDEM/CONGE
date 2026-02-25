"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/app/components/DataTable";
import EmployeeAvatar from "@/app/components/EmployeeAvatar";
import { getToken } from "@/lib/auth-client";
import { formatDateDMY } from "@/lib/date-format";

type HistoryItem = {
  id: string;
  firstName: string;
  lastName: string;
  employeeName: string;
  profilePhotoUrl?: string | null;
  employeeRole: string;
  leaveBalance: number;
  type: string;
  startDate: string;
  endDate: string;
  status: "APPROVED" | "REJECTED" | "CANCELLED";
  decidedBy: string;
  decidedAt: string;
  days: number;
};

type LeaveApiItem = {
  id: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  status?: "APPROVED" | "REJECTED" | "CANCELLED";
  employee?: { firstName?: string; lastName?: string; profilePhotoUrl?: string; role?: string; leaveBalance?: number } | null;
  decisions?: Array<{
    createdAt?: string;
    actor?: { firstName?: string; lastName?: string; role?: string } | null;
  }>;
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

function statusLabel(status: HistoryItem["status"]) {
  if (status === "APPROVED") return "Validée";
  if (status === "REJECTED") return "Refusée";
  return "Annulée";
}

function statusClass(status: HistoryItem["status"]) {
  if (status === "APPROVED") return "text-emerald-700";
  if (status === "REJECTED") return "text-red-600";
  return "text-gray-500";
}

export default function OperationsDeptEmployeesHistory() {
  const [rows, setRows] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [historyStatusFilter, setHistoryStatusFilter] = useState("ALL");

  const loadHistory = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setIsLoading(true);

    try {
      const res = await fetch("/api/departments/operations/employees/history?maxLeaves=120", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;

      const leaves = Array.isArray(data?.leaves) ? (data.leaves as LeaveApiItem[]) : [];
      const nextRows: HistoryItem[] = leaves
        .filter(
          (item): item is LeaveApiItem & { id: string; status: "APPROVED" | "REJECTED" | "CANCELLED" } =>
            typeof item?.id === "string" &&
            (item.status === "APPROVED" || item.status === "REJECTED" || item.status === "CANCELLED")
        )
        .map((item) => {
          const startRaw = item.startDate ?? "";
          const endRaw = item.endDate ?? "";
          const decidedAtRaw = item.decisions?.[0]?.createdAt;
          const actor = item.decisions?.[0]?.actor;

          return {
            id: item.id,
            firstName: item.employee?.firstName ?? "",
            lastName: item.employee?.lastName ?? "",
            employeeName:
              `${item.employee?.firstName ?? ""} ${item.employee?.lastName ?? ""}`.trim() || "—",
            profilePhotoUrl: item.employee?.profilePhotoUrl ?? null,
            employeeRole: item.employee?.role ?? "—",
            leaveBalance: item.employee?.leaveBalance ?? 0,
            type: item.type ?? "—",
            startDate: formatDateDMY(startRaw),
            endDate: formatDateDMY(endRaw),
            status: item.status,
            decidedBy:
              `${actor?.firstName ?? ""} ${actor?.lastName ?? ""}`.trim() ||
              actor?.role ||
              "-",
            decidedAt: decidedAtRaw ? formatDateDMY(decidedAtRaw) : "-",
            days: startRaw && endRaw ? daysBetweenInclusive(startRaw, endRaw) : 0,
          };
        });

      setRows(nextRows);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void loadHistory();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadHistory]);

  const filteredHistoryItems = useMemo(() => {
    if (historyStatusFilter === "ALL") return rows;
    return rows.filter((item) => item.status === historyStatusFilter);
  }, [rows, historyStatusFilter]);

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
              <div className="text-xs text-vdm-gold-700">
                {row.original.employeeRole} · Reste: {row.original.leaveBalance} jour
                {row.original.leaveBalance > 1 ? "s" : ""}
              </div>
            </div>
          </div>
        ),
      },
      { header: "Solde restant", accessorKey: "leaveBalance" },
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
      { header: "Decision", accessorKey: "decidedAt" },
    ],
    []
  );

  return (
    <div className="p-6">
      <div className="text-xl font-semibold mb-1 text-vdm-gold-800">
        Historique des congés - département opérations
      </div>
      <div className="text-sm text-vdm-gold-700 mb-4">
        Demandes traitées des employés de votre département.
      </div>

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

      <DataTable
        data={filteredHistoryItems}
        columns={columns}
        searchPlaceholder="Rechercher une demande..."
        onRefresh={loadHistory}
      />
      {isLoading ? <div className="mt-3 text-xs text-vdm-gold-700">Chargement de l&apos;historique...</div> : null}
    </div>
  );
}
