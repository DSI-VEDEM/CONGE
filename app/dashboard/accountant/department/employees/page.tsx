"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/app/components/DataTable";
import EmployeeAvatar from "@/app/components/EmployeeAvatar";
import { getEmployee, getToken } from "@/lib/auth-client";
import toast from "react-hot-toast";

type EmployeeRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  profilePhotoUrl?: string | null;
  matricule?: string | null;
  jobTitle?: string | null;
  role: "CEO" | "ACCOUNTANT" | "DEPT_HEAD" | "SERVICE_HEAD" | "EMPLOYEE";
  status: "PENDING" | "ACTIVE" | "REJECTED";
  department?: string | null;
  service?: string | null;
  departmentName?: string;
  serviceName?: string;
};

const roleLabel: Record<EmployeeRow["role"], string> = {
  CEO: "PDG",
  ACCOUNTANT: "Comptable",
  DEPT_HEAD: "Directeur des opérations",
  SERVICE_HEAD: "Directeur Adjoint",
  EMPLOYEE: "Employé",
};

type EmployeeApiItem = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  profilePhotoUrl?: string | null;
  matricule?: string | null;
  jobTitle?: string | null;
  role?: EmployeeRow["role"];
  status?: EmployeeRow["status"];
  departmentId?: string | null;
  serviceId?: string | null;
  department?: { id: string; name?: string | null; type?: string | null } | null;
  service?: { id: string; name?: string | null; type?: string | null } | null;
};

export default function AccountantDepartmentEmployees() {
  const currentEmployee = useMemo(() => getEmployee(), []);
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [draft, setDraft] = useState<EmployeeRow | null>(null);

  const startEdit = useCallback((row: EmployeeRow) => {
    setDraft({ ...row });
  }, []);

  const cancelEdit = useCallback(() => {
    if (isSaving) return;
    setDraft(null);
  }, [isSaving]);

  const loadEmployees = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setIsLoading(true);
    try {
      const empRes = await fetch("/api/departments/daf/employees", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const empData = await empRes.json().catch(() => ({}));
      if (!empRes.ok) {
        setRows([]);
        return;
      }

      const employeesList = Array.isArray(empData?.employees) ? (empData.employees as EmployeeApiItem[]) : [];
      const employees = employeesList.map((e) => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email,
        profilePhotoUrl: e.profilePhotoUrl ?? null,
        matricule: e.matricule,
        jobTitle: e.jobTitle,
        role: e.role ?? "EMPLOYEE",
        status: e.status ?? "ACTIVE",
        department: e.departmentId ?? null,
        service: e.serviceId ?? null,
        departmentName: e.department?.name ?? e.department?.type ?? "—",
        serviceName: e.service?.name ?? e.service?.type ?? "—",
      })) as EmployeeRow[];

      setRows(employees.filter((e) => e.id !== currentEmployee?.id));
    } finally {
      setIsLoading(false);
    }
  }, [currentEmployee?.id]);

  const saveEdit = useCallback(async () => {
    if (!draft) return;
    const token = getToken();
    if (!token) return;
    setIsSaving(true);
    const t = toast.loading("Enregistrement en cours...");
    try {
      const res = await fetch(`/api/employees/${draft.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firstName: draft.firstName,
          lastName: draft.lastName,
          jobTitle: draft.jobTitle,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(data?.error ?? "Échec de la mise à jour"), { id: t });
        return;
      }

      await loadEmployees();
      setDraft(null);
      toast.success("Employé mis à jour avec succès", { id: t });
    } catch {
      toast.error("Erreur réseau pendant la mise à jour", { id: t });
    } finally {
      setIsSaving(false);
    }
  }, [draft, loadEmployees]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const columns = useMemo<ColumnDef<EmployeeRow>[]>(
    () => [
      {
        id: "employee",
        header: "Employé",
        accessorFn: (row) => `${row.firstName} ${row.lastName}`,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
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
      { header: "Email", accessorKey: "email" },
      {
        header: "Poste",
        accessorKey: "jobTitle",
        cell: ({ row }) => row.original.jobTitle ?? "—",
      },
      {
        header: "Rôle",
        accessorKey: "role",
        cell: ({ row }) => roleLabel[row.original.role] ?? row.original.role,
      },
      { header: "Statut", accessorKey: "status" },
      {
        header: "Département",
        accessorKey: "department",
        cell: ({ row }) => row.original.departmentName ?? "—",
      },
      {
        header: "Service",
        accessorKey: "service",
        cell: ({ row }) => row.original.serviceName ?? "—",
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <button
            onClick={() => startEdit(row.original)}
            className="px-2 py-1 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
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
      <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Employés actuels (DAF)</div>
      <div className="text-sm text-vdm-gold-700 mb-4">
        Liste des employés du DAF avec toutes les informations. Cliquez sur Modifier pour éditer.
      </div>

      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Rechercher un employé..."
        pageSize={10}
        onRefresh={loadEmployees}
      />

      {isLoading ? <div className="mt-3 text-xs text-vdm-gold-700">Chargement des employés...</div> : null}

      {draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white border border-vdm-gold-200 shadow-2xl p-5 space-y-4">
            <div>
              <div className="text-lg font-semibold text-vdm-gold-900">Modifier l&apos;employé</div>
              <div className="text-sm text-vdm-gold-700">
                {draft.firstName} {draft.lastName}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-vdm-gold-900">
                Prénom
                <input
                  value={draft.firstName}
                  onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
                  className="mt-1 w-full rounded-md border border-vdm-gold-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                  disabled={isSaving}
                />
              </label>

              <label className="text-sm text-vdm-gold-900">
                Nom
                <input
                  value={draft.lastName}
                  onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
                  className="mt-1 w-full rounded-md border border-vdm-gold-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                  disabled={isSaving}
                />
              </label>

              <label className="text-sm text-vdm-gold-900">
                Email (géré par le PDG)
                <input
                  type="email"
                  value={draft.email}
                  readOnly
                  className="mt-1 w-full rounded-md border border-vdm-gold-200 bg-vdm-gold-50 px-3 py-2 text-sm text-vdm-gold-800"
                />
              </label>

              <label className="text-sm text-vdm-gold-900">
                Matricule (géré par le PDG)
                <input
                  value={draft.matricule ?? ""}
                  readOnly
                  className="mt-1 w-full rounded-md border border-vdm-gold-200 bg-vdm-gold-50 px-3 py-2 text-sm text-vdm-gold-800"
                />
              </label>

              <label className="text-sm text-vdm-gold-900">
                Poste
                <input
                  value={draft.jobTitle ?? ""}
                  onChange={(e) => setDraft({ ...draft, jobTitle: e.target.value })}
                  className="mt-1 w-full rounded-md border border-vdm-gold-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                  disabled={isSaving}
                />
              </label>

              <label className="text-sm text-vdm-gold-900">
                Statut (géré par le PDG)
                <input
                  value={draft.status}
                  readOnly
                  className="mt-1 w-full rounded-md border border-vdm-gold-200 bg-vdm-gold-50 px-3 py-2 text-sm text-vdm-gold-800"
                />
              </label>

            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={cancelEdit}
                className="px-3 py-2 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50"
                disabled={isSaving}
              >
                Annuler
              </button>
              <button
                onClick={saveEdit}
                className="px-3 py-2 rounded-md bg-vdm-gold-700 text-white text-sm hover:bg-vdm-gold-800 disabled:opacity-60"
                disabled={isSaving}
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
