"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import toast from "react-hot-toast";

import DataTable from "@/app/components/DataTable";
import EmployeeAvatar from "@/app/components/EmployeeAvatar";
import { getToken } from "@/lib/auth-client";
import { formatDateDMY } from "@/lib/date-format";

type EmployeeRow = {
  id: string;
  firstName: string;
  lastName: string;
  role: "CEO" | "ACCOUNTANT" | "DEPT_HEAD" | "SERVICE_HEAD" | "EMPLOYEE";
  email: string;
  matricule?: string | null;
  jobTitle?: string | null;
  status: "PENDING" | "ACTIVE" | "REJECTED";
  createdAt: string;
  profilePhotoUrl?: string | null;
};

export default function DsiPasswordResetPage() {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isResettingId, setIsResettingId] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const loadEmployees = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/departments/dsi/employees", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Impossible de charger les employés DSI.");
        setRows([]);
        return;
      }
      const list = Array.isArray(data.employees) ? data.employees : [];
      const mapped = list.map((employee: any) => ({
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        matricule: employee.matricule ?? null,
        jobTitle: employee.jobTitle ?? null,
        role: employee.role ?? "EMPLOYEE",
        status: employee.status ?? "ACTIVE",
        createdAt: employee.createdAt ?? "",
        profilePhotoUrl: employee.profilePhotoUrl ?? null,
      }));
      setRows(mapped);
      setLastUpdatedAt(new Date().toISOString());
    } catch {
      toast.error("Erreur réseau lors du chargement des employés.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const resetPassword = useCallback(
    async (employeeId: string) => {
      const token = getToken();
      if (!token) return;
      setIsResettingId(employeeId);
      try {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ employeeId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error ?? "Impossible de réinitialiser le mot de passe.");
          return;
        }
        toast.success("Mot de passe réinitialisé (mot de passe par défaut appliqué).");
        setRows((prev) => prev.filter((row) => row.id !== employeeId));
        await loadEmployees();
      } catch {
        toast.error("Erreur réseau lors de la réinitialisation.");
      } finally {
        setIsResettingId(null);
      }
    },
    [loadEmployees]
  );

  const columns = useMemo<ColumnDef<EmployeeRow>[]>(
    () => [
      {
        id: "employee",
        header: "Employé",
        accessorFn: (row) => `${row.firstName} ${row.lastName}`,
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <EmployeeAvatar
              firstName={row.original.firstName}
              lastName={row.original.lastName}
              profilePhotoUrl={row.original.profilePhotoUrl}
            />
            <div>
              <div className="font-semibold">
                {row.original.firstName} {row.original.lastName}
              </div>
              <div className="text-xs text-vdm-gold-700">{row.original.matricule ?? ""}</div>
            </div>
          </div>
        ),
      },
      {
        header: "E-mail",
        accessorKey: "email",
      },
      {
        header: "Date de création",
        accessorKey: "createdAt",
        cell: ({ row }) => (row.original.createdAt ? formatDateDMY(row.original.createdAt) : "—"),
      },
      {
        header: "Statut",
        accessorKey: "status",
        cell: ({ row }) => <span className="text-xs uppercase tracking-[0.3em]">{row.original.status}</span>,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => resetPassword(row.original.id)}
            disabled={isResettingId === row.original.id}
            className="px-3 py-1 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs font-semibold transition disabled:opacity-60"
          >
            {isResettingId === row.original.id ? "Traitement..." : "Réinitialiser"}
          </button>
        ),
      },
    ],
    [resetPassword, isResettingId]
  );

  const defaultPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Réinitialisation des mots de passe</div>
        <div className="text-sm text-vdm-gold-700">
          Réinitialisez les comptes DSI en cas de perte de mot de passe. Le mot de passe par défaut défini dans l’environnement sera appliqué.
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-dashed border-vdm-gold-300 bg-white/40 p-4 text-center shadow-sm">
          <div className="text-xs uppercase tracking-[0.3em] text-gray-500">Équipiers</div>
          <div className="text-3xl font-semibold text-vdm-gold-800">{rows.length}</div>
          <div className="text-xs text-gray-500">à jour pour réinitialisation</div>
        </div>
        <div className="rounded-2xl border border-vdm-gold-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Mot de passe par défaut</p>
          <p className="text-sm font-semibold text-gray-800 mt-1">
            <span className="font-mono text-xs text-vdm-gold-700">{defaultPassword}</span>
          </p>
          <p className="text-xs text-gray-500 mt-2">Appliquez-le puis invitez l'employé à changer son mot de passe.</p>
        </div>
        <div className="rounded-2xl border border-vdm-gold-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-gray-400">
            <span>Dernier chargement</span>
            <button
              type="button"
              onClick={loadEmployees}
              disabled={isLoading}
              className="text-vdm-gold-600 hover:text-vdm-gold-800 disabled:opacity-60"
            >
              {isLoading ? "..." : "Rafraîchir"}
            </button>
          </div>
          <p className="text-sm text-gray-800 mt-1 break-words">
            {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString("fr-FR") : "Jamais chargé"}
          </p>
        </div>
      </div>
      <div className="rounded-2xl border border-vdm-gold-100 bg-white p-4 shadow-sm">
        <DataTable
          data={rows}
          columns={columns}
          searchPlaceholder="Rechercher un employé…"
          onRefresh={loadEmployees}
        />
      </div>
      {isLoading ? <div className="mt-3 text-xs text-vdm-gold-700">Chargement des employés...</div> : null}
    </div>
  );
}
