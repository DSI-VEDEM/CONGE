"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import toast from "react-hot-toast";

import DataTable from "@/app/components/DataTable";
import EmployeeAvatar from "@/app/components/EmployeeAvatar";
import { getToken } from "@/lib/auth-client";

type EmployeeRole = "CEO" | "ACCOUNTANT" | "DEPT_HEAD" | "SERVICE_HEAD" | "EMPLOYEE";
type EmployeeStatus = "PENDING" | "ACTIVE" | "REJECTED";

type EmployeeRow = {
  id: string;
  firstName: string;
  lastName: string;
  profilePhotoUrl?: string | null;
  email: string;
  matricule?: string | null;
  jobTitle?: string | null;
  role: EmployeeRole;
  status: EmployeeStatus;
  departmentName: string;
  serviceName: string;
};

type EmployeeApiItem = {
  id: string;
  firstName: string;
  lastName: string;
  profilePhotoUrl?: string | null;
  email: string;
  matricule?: string | null;
  jobTitle?: string | null;
  role?: EmployeeRole;
  status?: EmployeeStatus;
  department?: { name?: string | null; type?: string | null } | null;
  service?: { name?: string | null; type?: string | null } | null;
};

type DraftIdentity = {
  id: string;
  fullName: string;
  email: string;
  matricule: string;
};

const roleLabel: Record<EmployeeRole, string> = {
  CEO: "PDG",
  ACCOUNTANT: "Comptable",
  DEPT_HEAD: "Directeur département",
  SERVICE_HEAD: "Directeur adjoint",
  EMPLOYEE: "Employé",
};

const statusLabel: Record<EmployeeStatus, string> = {
  ACTIVE: "Actif",
  PENDING: "En attente",
  REJECTED: "Rejeté",
};

function mapEmployee(employee: EmployeeApiItem): EmployeeRow {
  return {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    profilePhotoUrl: employee.profilePhotoUrl ?? null,
    email: employee.email,
    matricule: employee.matricule ?? null,
    jobTitle: employee.jobTitle ?? null,
    role: employee.role ?? "EMPLOYEE",
    status: employee.status ?? "ACTIVE",
    departmentName: employee.department?.name ?? employee.department?.type ?? "—",
    serviceName: employee.service?.name ?? employee.service?.type ?? "—",
  };
}

export default function DsiIdentityPage() {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState<DraftIdentity | null>(null);

  const loadEmployees = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/employees/identity", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Impossible de charger les employés.");
        setRows([]);
        return;
      }

      const employees = Array.isArray(data?.employees) ? data.employees : [];
      setRows(employees.map((employee: EmployeeApiItem) => mapEmployee(employee)));
    } catch {
      toast.error("Erreur réseau lors du chargement des employés.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const startEdit = useCallback((row: EmployeeRow) => {
    setDraft({
      id: row.id,
      fullName: `${row.firstName} ${row.lastName}`,
      email: row.email,
      matricule: row.matricule ?? "",
    });
  }, []);

  const saveIdentity = useCallback(async () => {
    if (!draft) return;
    const token = getToken();
    if (!token) return;

    const email = draft.email.trim().toLowerCase();
    const matricule = draft.matricule.trim();

    if (!email) {
      toast.error("Veuillez renseigner un email.");
      return;
    }

    setIsSaving(true);
    const t = toast.loading("Enregistrement...");
    try {
      const res = await fetch(`/api/admin/employees/${draft.id}/identity`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email, matricule }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error ?? "Impossible de modifier l'identité.", { id: t });
        return;
      }

      const updated = data?.employee ? mapEmployee(data.employee as EmployeeApiItem) : null;
      if (updated) {
        setRows((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      }
      setDraft(null);
      toast.success("Email et matricule mis à jour.", { id: t });
    } catch {
      toast.error("Erreur réseau lors de l'enregistrement.", { id: t });
    } finally {
      setIsSaving(false);
    }
  }, [draft]);

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
              <div className="text-xs text-vdm-gold-700">{row.original.jobTitle ?? "—"}</div>
            </div>
          </div>
        ),
      },
      {
        header: "Email",
        accessorKey: "email",
      },
      {
        header: "Matricule",
        accessorKey: "matricule",
        cell: ({ row }) => row.original.matricule ?? "—",
      },
      {
        header: "Département",
        accessorKey: "departmentName",
      },
      {
        header: "Rôle",
        accessorKey: "role",
        cell: ({ row }) => roleLabel[row.original.role] ?? row.original.role,
      },
      {
        header: "Statut",
        accessorKey: "status",
        cell: ({ row }) => statusLabel[row.original.status] ?? row.original.status,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => startEdit(row.original)}
            className="px-3 py-1 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs font-semibold hover:bg-vdm-gold-50"
          >
            Modifier
          </button>
        ),
      },
    ],
    [startEdit]
  );

  return (
    <div className="p-6">
      <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Emails et matricules</div>
      <div className="text-sm text-vdm-gold-700 mb-4">
        Modifier les identifiants de connexion des employés.
      </div>

      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Rechercher un employé, email ou matricule..."
        pageSize={10}
        onRefresh={loadEmployees}
      />

      {isLoading ? <div className="mt-3 text-xs text-vdm-gold-700">Chargement des employés...</div> : null}

      {draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-vdm-gold-200 bg-white p-5 shadow-xl">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-vdm-gold-900">Modifier les identifiants</h2>
              <p className="text-sm text-vdm-gold-700">{draft.fullName}</p>
            </div>

            <div className="grid gap-3">
              <label className="text-sm text-vdm-gold-900">
                Email
                <input
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  className="mt-1 w-full rounded-md border border-vdm-gold-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                />
              </label>
              <label className="text-sm text-vdm-gold-900">
                Matricule
                <input
                  value={draft.matricule}
                  onChange={(e) => setDraft({ ...draft, matricule: e.target.value })}
                  className="mt-1 w-full rounded-md border border-vdm-gold-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                disabled={isSaving}
                className="px-3 py-2 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50 disabled:opacity-60"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={saveIdentity}
                disabled={isSaving}
                className="px-3 py-2 rounded-md bg-vdm-gold-700 text-white text-sm hover:bg-vdm-gold-800 disabled:opacity-60"
              >
                {isSaving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
