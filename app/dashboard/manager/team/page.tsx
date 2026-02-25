"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/app/components/DataTable";
import EmployeeAvatar from "@/app/components/EmployeeAvatar";
import { getEmployee, getToken } from "@/lib/auth-client";

type TeamMember = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  profilePhotoUrl?: string | null;
  matricule?: string | null;
  jobTitle?: string | null;
  status: "ACTIVE" | "PENDING" | "REJECTED";
  service?: string | null;
  departmentId?: string | null;
};

export default function ManagerTeamPage() {
  const [rows, setRows] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const manager = useMemo(() => getEmployee(), []);

  const loadTeam = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/departments/operations/employees?maxEmployees=120", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRows([]);
        return;
      }
      const employees = (data?.employees ?? []).map((e: any) => ({
        id: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email,
        profilePhotoUrl: e.profilePhotoUrl ?? null,
        matricule: e.matricule,
        jobTitle: e.jobTitle,
        status: e.status ?? "ACTIVE",
        service:
          e.service?.name ?? e.service?.type ?? e.serviceId ?? null,
        departmentId: e.departmentId ?? null,
      })) as TeamMember[];
      setRows(employees);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeam();
    }, [loadTeam]);

  const columns = useMemo<ColumnDef<TeamMember>[]>(
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
      { header: "Poste", accessorKey: "jobTitle" },
      { header: "Statut", accessorKey: "status" },
      { header: "Service", accessorKey: "service" },
    ],
    [manager]
  );

  return (
    <div className="p-6">
      <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Équipe</div>
      <div className="text-sm text-vdm-gold-700 mb-4">
        Liste des employés de votre service.
      </div>

      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Rechercher un employé..."
        onRefresh={loadTeam}
      />
      {isLoading ? (
        <div className="mt-3 text-xs text-vdm-gold-700">Chargement de l'équipe...</div>
      ) : null}
    </div>
  );
}
