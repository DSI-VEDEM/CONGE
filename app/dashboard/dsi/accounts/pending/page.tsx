"use client";
// app/(dashboard)/dsi/accounts/pending/page.tsx  (ou ton chemin exact)
// ✅ FICHIER COMPLET


import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/app/components/DataTable";
import EmployeeAvatar from "@/app/components/EmployeeAvatar";
import { getToken } from "@/lib/auth-client";
import toast from "react-hot-toast";

type PendingEmp = {
  id: string;
  firstName: string;
  lastName: string;
  profilePhotoUrl?: string | null;
  email: string;
  matricule?: string | null;
  role: "EMPLOYEE" | "ACCOUNTANT" | "DEPT_HEAD" | "SERVICE_HEAD";
  department?: string;
  service?: string | null;
  status: "PENDING";
};

export default function DsiAccountsPending() {
  const [rows, setRows] = useState<PendingEmp[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [departments, setDepartments] = useState<{ id: string; label: string; type?: string }[]>([]);
  const [services, setServices] = useState<{ id: string; label: string; departmentId: string }[]>(
    []
  );
  const operationsDepartmentLabel =
    departments.find((d) => d.type === "OPERATIONS")?.label ?? "Direction des opérations";
  const dafDepartmentLabel =
    departments.find((d) => d.type === "DAF")?.label ?? "Direction Administrative et Financière";

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const [res, depRes, svcRes] = await Promise.all([
          fetch("/api/admin/employees/pending", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("/api/departments", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/services", { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        const data = await res.json().catch(() => ({}));
        const depData = await depRes.json().catch(() => ({}));
        const svcData = await svcRes.json().catch(() => ({}));

        if (res.ok) {
          setRows(
            (data?.employees ?? []).map((e: any) => ({
              id: e.id,
              firstName: e.firstName,
              lastName: e.lastName,
              profilePhotoUrl: e.profilePhotoUrl ?? null,
              email: e.email,
              matricule: e.matricule,
              role: (e.role ?? "EMPLOYEE") as PendingEmp["role"],
              department: e.departmentId ?? "",
              service: e.serviceId ?? "",
              status: e.status,
            }))
          );
          setDepartments(
            (depData?.departments ?? []).map((d: any) => ({
              id: d.id,
              label: d.name ?? d.type ?? d.id,
              type: d.type,
            }))
          );
          setServices(
            (svcData?.services ?? []).map((s: any) => ({
              id: s.id,
              label: s.name ?? s.type ?? s.id,
              departmentId: s.departmentId,
            }))
          );
        }
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const setDeptFor = (id: string, value: string) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, department: value } : row)));
  };

  const setServiceFor = (id: string, value: string) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, service: value } : row)));
  };

  const setRoleFor = (id: string, value: PendingEmp["role"]) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        if (value !== "SERVICE_HEAD" && value !== "ACCOUNTANT") {
          if (
            value === "DEPT_HEAD" &&
            row.department &&
            departments.some((d) => d.id === row.department && d.type === "OTHERS")
          ) {
            return { ...row, role: value, department: "", service: "" };
          }
          return { ...row, role: value };
        }

        if (value === "ACCOUNTANT") {
          const dafDepartmentId = departments.find((d) => d.type === "DAF")?.id ?? row.department ?? "";
          return {
            ...row,
            role: value,
            department: dafDepartmentId,
            service: "",
          };
        }

        const operationsDepartmentId =
          departments.find((d) => d.type === "OPERATIONS")?.id ?? row.department ?? "";

        return {
          ...row,
          role: value,
          department: operationsDepartmentId,
          service: row.service ?? "",
        };
      })
    );
  };

  const approve = async (id: string) => {
    const target = rows.find((row) => row.id === id);
    if (!target?.department) {
      toast.error("Veuillez sélectionner un département avant validation.");
      return;
    }

    const token = getToken();
    if (!token) return;

    try {
      const t = toast.loading("Validation en cours...");

      const res = await fetch(`/api/admin/employees/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: "ACTIVE",
          role: target.role,
          departmentId: target.department || null,
          serviceId: target.service || null,
        }),
      });

      if (res.ok) {
        setRows((prev) => prev.filter((row) => row.id !== id));
        toast.success("Compte validé.", { id: t });
        return;
      }

      toast.error("Erreur lors de la validation.", { id: t });
    } catch {
      toast.error("Erreur lors de la validation.");
    }
  };

  const reject = async (id: string) => {
    const token = getToken();
    if (!token) return;

    try {
      const t = toast.loading("Refus en cours...");
      const res = await fetch(`/api/admin/employees/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "REJECTED" }),
      });

      if (res.ok) {
        setRows((prev) => prev.filter((row) => row.id !== id));
        toast.success("Compte refusé.", { id: t });
        return;
      }

      toast.error("Erreur lors du refus.", { id: t });
    } catch {
      toast.error("Erreur lors du refus.");
    }
  };

  const columns = useMemo<ColumnDef<PendingEmp>[]>(
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
        header: "Rôle",
        cell: ({ row }) => (
          <select
            value={row.original.role}
            onChange={(e) => setRoleFor(row.original.id, e.target.value as PendingEmp["role"])}
            className="w-full border border-vdm-gold-200 rounded-md p-1 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
          >
            <option value="EMPLOYEE">EMPLOYÉ</option>
            <option value="ACCOUNTANT">COMPTABLE</option>
            <option value="DEPT_HEAD">DIRECTEUR DÉPARTEMENT</option>
            <option value="SERVICE_HEAD">DIRECTEUR ADJOINT</option>
          </select>
        ),
      },
      {
        header: "Département",
        cell: ({ row }) =>
          row.original.role === "SERVICE_HEAD" ? (
            <input
              value={operationsDepartmentLabel}
              readOnly
              className="w-full border border-vdm-gold-200 rounded-md p-1 bg-vdm-gold-50 text-xs text-vdm-gold-800"
            />
          ) : row.original.role === "ACCOUNTANT" ? (
            <input
              value={dafDepartmentLabel}
              readOnly
              className="w-full border border-vdm-gold-200 rounded-md p-1 bg-vdm-gold-50 text-xs text-vdm-gold-800"
            />
          ) : (
            <select
              value={row.original.department ?? ""}
              onChange={(e) => setDeptFor(row.original.id, e.target.value)}
              className="w-full border border-vdm-gold-200 rounded-md p-1 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
            >
              <option value="">Choisir</option>
              {departments
                .filter((d) => !(row.original.role === "DEPT_HEAD" && d.type === "OTHERS"))
                .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
                ))}
            </select>
          ),
      },
      {
        header: "Service",
        cell: ({ row }) => (
          <select
            value={row.original.service ?? ""}
            onChange={(e) => setServiceFor(row.original.id, e.target.value)}
            disabled={row.original.role === "ACCOUNTANT"}
            className="w-full border border-vdm-gold-200 rounded-md p-1 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
          >
            <option value="">Aucun</option>
            {services
              .filter((s) => !row.original.department || s.departmentId === row.original.department)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
          </select>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex gap-2">
            <button
              onClick={() => approve(row.original.id)}
              className="px-2 py-1 rounded-md bg-vdm-gold-700 text-white text-xs hover:bg-vdm-gold-800"
            >
              Valider
            </button>
            <button
              onClick={() => reject(row.original.id)}
              className="px-2 py-1 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
            >
              Refuser
            </button>
          </div>
        ),
      },
    ],
    [rows, departments, services]
  );

  return (
    <div className="p-6">
      <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Validation des comptes</div>
      <div className="text-sm text-vdm-gold-700 mb-4">
        Valider/refuser les nouveaux employés (tous départements).
      </div>

      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Rechercher un employe..."
        pageSize={10}
        onRefresh={() => window.location.reload()}
      />

      {isLoading ? <div className="mt-3 text-xs text-vdm-gold-700">Chargement des comptes...</div> : null}
    </div>
  );
}
