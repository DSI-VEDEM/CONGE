"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/app/components/DataTable";
import EmployeeAvatar from "@/app/components/EmployeeAvatar";
import { getToken } from "@/lib/auth-client";
import { formatDateDMY } from "@/lib/date-format";

type HistoryItem = {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  profilePhotoUrl?: string | null;
  employeeName: string;
  action: "JOINED" | "LEFT";
  date: string;
  role: string;
  status: "PENDING" | "ACTIVE" | "REJECTED";
};

export default function CeoOthersEmployeesHistory() {
  const [rows, setRows] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/departments/others/employees/history", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;

      const history = Array.isArray(data?.history) ? data.history : [];
      const nextRows = history
        .filter((item: any) => typeof item?.id === "string")
        .map((item: any) => ({
          id: item.id,
          employeeId: String(item.employeeId ?? ""),
          firstName: String(item.firstName ?? ""),
          lastName: String(item.lastName ?? ""),
          profilePhotoUrl: item.profilePhotoUrl ?? null,
          employeeName: `${String(item.firstName ?? "")} ${String(item.lastName ?? "")}`.trim() || "—",
          action: item.action === "LEFT" ? "LEFT" : "JOINED",
          date: formatDateDMY(item.date),
          role: String(item.role ?? "—"),
          status: item.status === "REJECTED" ? "REJECTED" : item.status === "PENDING" ? "PENDING" : "ACTIVE",
        })) as HistoryItem[];

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
              <div className="text-xs text-vdm-gold-700">{row.original.role}</div>
            </div>
          </div>
        ),
      },
      {
        header: "Action",
        accessorKey: "action",
        cell: ({ row }) => (
          <span className={`text-xs font-semibold ${row.original.action === "LEFT" ? "text-red-600" : "text-emerald-700"}`}>
            {row.original.action === "LEFT" ? "Sortie" : "Entrée"}
          </span>
        ),
      },
      { header: "Statut compte", accessorKey: "status" },
      { header: "Date", accessorKey: "date" },
    ],
    []
  );

  return (
    <div className="p-6">
      <div className="text-xl font-semibold mb-1 text-vdm-gold-800">
        Historique — Employés Autres
      </div>
      <div className="text-sm text-vdm-gold-700 mb-4">Entrées / sorties du département.</div>

      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Rechercher un employé..."
        onRefresh={loadHistory}
      />
      {isLoading ? <div className="mt-3 text-xs text-vdm-gold-700">Chargement de l&apos;historique...</div> : null}
    </div>
  );
}
