"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/app/components/DataTable";
import EmployeeAvatar from "@/app/components/EmployeeAvatar";
import { getToken } from "@/lib/auth-client";

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
};

const roleLabel: Record<EmployeeRow["role"], string> = {
  CEO: "PDG",
  ACCOUNTANT: "Comptable",
  DEPT_HEAD: "Directeur des opérations",
  SERVICE_HEAD: "Directeur Adjoint",
  EMPLOYEE: "Employé",
};

export default function CeoOthersEmployees() {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [departments, setDepartments] = useState<Record<string, string>>({});
  const [services, setServices] = useState<Record<string, string>>({});

  const [draft, setDraft] = useState<EmployeeRow | null>(null);

  const startEdit = (row: EmployeeRow) => {
    setDraft({ ...row });
  };

  const cancelEdit = () => {
    setDraft(null);
  };

  const saveEdit = useCallback(async () => {
    if (!draft) return;
    const token = getToken();
    if (!token) return;
    setIsSaving(true);
    try {
      setRows((prev) => prev.map((r) => (r.id === draft.id ? draft : r)));
      const res = await fetch(`/api/employees/${draft.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firstName: draft.firstName,
          lastName: draft.lastName,
          email: draft.email,
          matricule: draft.matricule,
          jobTitle: draft.jobTitle,
          role: draft.role,
          status: draft.status,
          departmentId: draft.department ?? null,
          serviceId: draft.service ?? null,
        }),
      });
      if (res.ok) setDraft(null);
    } finally {
      setIsSaving(false);
    }
  }, [draft]);

  const loadEmployees = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setIsLoading(true);
    try {
      const empRes = await fetch("/api/departments/others/employees", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const empData = await empRes.json().catch(() => ({}));
      if (!empRes.ok) return;

      const depMap: Record<string, string> = {};
      const svcMap: Record<string, string> = {};
      const normalized = (empData?.employees ?? []).map((e: any) => {
        const departmentId = e.departmentId ?? null;
        const serviceId = e.serviceId ?? null;
        if (departmentId) depMap[departmentId] = e.department?.name ?? e.department?.type ?? departmentId;
        if (serviceId) svcMap[serviceId] = e.service?.name ?? e.service?.type ?? serviceId;
        return {
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email,
        profilePhotoUrl: e.profilePhotoUrl ?? null,
        matricule: e.matricule,
        jobTitle: e.jobTitle,
        role: e.role ?? "EMPLOYEE",
        status: e.status ?? "ACTIVE",
        department: departmentId,
        service: serviceId,
      };
      }) as EmployeeRow[];

      setDepartments({ ...depMap });
      setServices({ ...svcMap });
      setRows(normalized);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
      {
        header: "Email",
        accessorKey: "email",
        cell: ({ row }) => row.original.email,
      },
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
      {
        header: "Statut",
        accessorKey: "status",
        cell: ({ row }) => row.original.status,
      },
      {
        header: "Département",
        accessorKey: "department",
        cell: ({ row }) => departments[row.original.department ?? ""] ?? "—",
      },
      {
        header: "Service",
        accessorKey: "service",
        cell: ({ row }) => services[row.original.service ?? ""] ?? "—",
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
    [departments, services]
  );

  return (
    <div className="p-6">
      <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Employés (Autres)</div>
      <div className="text-sm text-vdm-gold-700 mb-4">Gestion des employés du département Autres.</div>

      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Rechercher un employé..."
        pageSize={10}
        onRefresh={loadEmployees}
      />
      {isLoading ? <div className="mt-3 text-xs text-vdm-gold-700">Chargement des employés...</div> : null}

      {draft ? (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={cancelEdit}
          role="dialog"
          aria-modal="true"
          aria-label="Modifier employé"
        >
          <div
            className="w-full max-w-2xl bg-white rounded-xl border border-vdm-gold-200 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-vdm-gold-800 mb-1">Modifier les informations</div>
            <div className="text-sm text-vdm-gold-700 mb-4">
              {draft.firstName} {draft.lastName}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={draft.firstName}
                onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
                className="w-full rounded-md border border-vdm-gold-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                placeholder="Prénom"
              />
              <input
                value={draft.lastName}
                onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
                className="w-full rounded-md border border-vdm-gold-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                placeholder="Nom"
              />
              <input
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                className="w-full rounded-md border border-vdm-gold-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500 md:col-span-2"
                placeholder="Email"
              />
              <input
                value={draft.matricule ?? ""}
                onChange={(e) => setDraft({ ...draft, matricule: e.target.value })}
                className="w-full rounded-md border border-vdm-gold-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                placeholder="Matricule"
              />
              <input
                value={draft.jobTitle ?? ""}
                onChange={(e) => setDraft({ ...draft, jobTitle: e.target.value })}
                className="w-full rounded-md border border-vdm-gold-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                placeholder="Poste"
              />
              <select
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value as EmployeeRow["role"] })}
                className="w-full rounded-md border border-vdm-gold-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
              >
                <option value="EMPLOYEE">Employé</option>
                <option value="DEPT_HEAD">Chef de département</option>
                <option value="SERVICE_HEAD">Directeur adjoint</option>
                <option value="ACCOUNTANT">Comptable</option>
              </select>
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as EmployeeRow["status"] })}
                className="w-full rounded-md border border-vdm-gold-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
              >
                <option value="ACTIVE">Actif</option>
                <option value="PENDING">En attente</option>
                <option value="REJECTED">Rejeté</option>
              </select>
              <select
                value={draft.department ?? ""}
                onChange={(e) => setDraft({ ...draft, department: e.target.value || null })}
                className="w-full rounded-md border border-vdm-gold-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
              >
                <option value="">Aucun département</option>
                {Object.entries(departments).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={draft.service ?? ""}
                onChange={(e) => setDraft({ ...draft, service: e.target.value || null })}
                className="w-full rounded-md border border-vdm-gold-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
              >
                <option value="">Aucun service</option>
                {Object.entries(services).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-5 flex justify-end gap-2">
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
