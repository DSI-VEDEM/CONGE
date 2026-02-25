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
  leaveBalance?: number;
  annualLeaveBalance?: number;
  departmentId?: string | null;
  serviceId?: string | null;
};

type DepartmentApiItem = { id: string; name?: string | null; type?: string | null };
type ServiceApiItem = { id: string; name?: string | null; type?: string | null };

const roleLabel: Record<EmployeeRow["role"], string> = {
  CEO: "PDG",
  ACCOUNTANT: "Comptable",
  DEPT_HEAD: "Directeur des opérations",
  SERVICE_HEAD: "Directeur Adjoint",
  EMPLOYEE: "Employé",
};

export default function CeoEmployees() {
  const currentEmployee = useMemo(() => getEmployee(), []);
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [departments, setDepartments] = useState<Record<string, string>>({});
  const [services, setServices] = useState<Record<string, string>>({});
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRow | null>(null);
  const [balanceInput, setBalanceInput] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    matricule: "",
    jobTitle: "",
    role: "EMPLOYEE",
    status: "ACTIVE",
    departmentId: "",
    serviceId: "",
  });

  const [roleFilter, setRoleFilter] = useState("ALL");

  const selectedDeptType = useMemo(
    () => (editForm.departmentId ? String(departments[editForm.departmentId] ?? "") : ""),
    [editForm.departmentId, departments]
  );

  const showServiceField = selectedDeptType === "OPERATIONS";

  useEffect(() => {
    if (!selectedEmployee) return;
    const next = rows.find((row) => row.id === selectedEmployee.id);
    if (!next) {
      setSelectedEmployee(null);
      setIsEditModalOpen(false);
      setIsBalanceModalOpen(false);
      return;
    }
    setSelectedEmployee(next);
  }, [rows, selectedEmployee, setIsEditModalOpen, setIsBalanceModalOpen]);

  const updateLeaveBalance = useCallback(
    async (id: string, action: "RESET" | "INCREASE", amount?: number) => {
      const token = getToken();
      if (!token) return;
      const t = toast.loading("Mise à jour du solde...");
      try {
        const res = await fetch(`/api/employees/${id}/leave-balance`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action, amount }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const next = data?.employee?.leaveBalance;
          setRows((prev) =>
            prev.map((r) =>
              r.id === id
                ? {
                    ...r,
                    leaveBalance: next ?? r.leaveBalance,
                    annualLeaveBalance: next ?? r.annualLeaveBalance,
                  }
                : r
            )
          );
          toast.success("Solde mis à jour.", { id: t });
        } else {
          toast.error(data?.error || "Erreur lors de la mise à jour.", { id: t });
        }
      } catch {
        toast.error("Erreur réseau.", { id: t });
      }
    },
    []
  );

  const resetBalance = useCallback((id: string) => updateLeaveBalance(id, "RESET"), [updateLeaveBalance]);

  const openIncreaseModal = useCallback((employee: EmployeeRow) => {
    setSelectedEmployee(employee);
    setBalanceInput("");
    setIsBalanceModalOpen(true);
  }, []);

  const closeIncreaseModal = useCallback(() => {
    setIsBalanceModalOpen(false);
    setSelectedEmployee(null);
    setBalanceInput("");
  }, []);

  const confirmIncrease = useCallback(() => {
    if (!selectedEmployee) return;
    const amount = Number(balanceInput.replace(",", ".").trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Montant invalide.");
      return;
    }
    updateLeaveBalance(selectedEmployee.id, "INCREASE", amount);
    closeIncreaseModal();
  }, [balanceInput, closeIncreaseModal, selectedEmployee, updateLeaveBalance]);

  const openEditModal = useCallback((employee: EmployeeRow) => {
    setSelectedEmployee(employee);
    setEditForm({
      firstName: employee.firstName || "",
      lastName: employee.lastName || "",
      email: employee.email || "",
      matricule: employee.matricule || "",
      jobTitle: employee.jobTitle || "",
      role: employee.role || "EMPLOYEE",
      status: employee.status || "ACTIVE",
      departmentId: employee.departmentId || "",
      serviceId: employee.serviceId || "",
    });
    setIsEditModalOpen(true);
  }, []);

  const closeEditModal = useCallback(() => {
    setIsEditModalOpen(false);
    setSelectedEmployee(null);
  }, []);

  const confirmEdit = useCallback(async () => {
    if (!selectedEmployee) return;
    const token = getToken();
    if (!token) return;
    const t = toast.loading("Mise à jour...");
    try {
      const res = await fetch(`/api/employees/${selectedEmployee.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firstName: editForm.firstName,
          lastName: editForm.lastName,
          email: editForm.email,
          matricule: editForm.matricule,
          jobTitle: editForm.jobTitle,
          role: editForm.role,
          status: editForm.status,
          departmentId: editForm.departmentId || null,
          serviceId: editForm.serviceId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) => (r.id === selectedEmployee.id ? { ...r, ...data.employee } : r))
        );
        toast.success("Utilisateur modifié.", { id: t });
      } else {
        toast.error(data?.error || "Erreur lors de la mise à jour.", { id: t });
      }
    } catch {
      toast.error("Erreur réseau.", { id: t });
    }
  }, [editForm, selectedEmployee]);

  const deleteEmployee = useCallback(async (employee: EmployeeRow) => {
    if (employee.role === "CEO") {
      toast.error("Impossible de supprimer un compte PDG.");
      return;
    }
    const ok = window.confirm(
      `Supprimer ${employee.firstName} ${employee.lastName} — Cette action est irréversible.`
    );
    if (!ok) return;
    const token = getToken();
    if (!token) return;
    const t = toast.loading("Suppression en cours...");
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== employee.id));
        toast.success("Utilisateur supprimé.", { id: t });
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error || "Erreur lors de la suppression.", { id: t });
      }
    } catch {
      toast.error("Erreur réseau.", { id: t });
    }
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (roleFilter !== "ALL" && r.role !== roleFilter) return false;
      return true;
    });
  }, [rows, roleFilter]);

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
      { header: "Poste", accessorKey: "jobTitle" },
      {
        header: "Rôle",
        accessorKey: "role",
        cell: ({ row }) => roleLabel[row.original.role] ?? row.original.role,
      },
      { header: "Statut", accessorKey: "status" },
      {
        header: "Département",
        accessorFn: (row) => departments[row.departmentId ?? ""] ?? "-",
        cell: ({ row }) => departments[row.original.departmentId ?? ""] ?? "-",
      },
      {
        header: "Service",
        accessorFn: (row) => services[row.serviceId ?? ""] ?? "-",
        cell: ({ row }) => services[row.original.serviceId ?? ""] ?? "-",
      },
      {
        header: "Solde total annuel",
        accessorKey: "annualLeaveBalance",
        cell: ({ row }) =>
          Number.isFinite(row.original.annualLeaveBalance)
            ? `${Number(row.original.annualLeaveBalance).toFixed(1)} j`
            : "—",
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => openIncreaseModal(row.original)}
              className="px-2 py-1 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
            >
              + Solde
            </button>
            <button
              onClick={() => resetBalance(row.original.id)}
              className="px-2 py-1 rounded-md bg-vdm-gold-700 text-white text-xs hover:bg-vdm-gold-800"
            >
              Réinitialiser
            </button>
            <button
              onClick={() => openEditModal(row.original)}
              className="px-2 py-1 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
            >
              Modifier
            </button>
            <button
              onClick={() => deleteEmployee(row.original)}
              className="px-2 py-1 rounded-md border border-red-300 text-red-600 text-xs hover:bg-red-50"
            >
              Supprimer
            </button>
          </div>
        ),
      },
    ],
    [departments, services, openIncreaseModal, resetBalance, deleteEmployee, openEditModal]
  );

  const loadEmployees = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setIsLoading(true);
    try {
      const [empRes, depRes, svcRes] = await Promise.all([
        fetch("/api/employees?fast=1", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/departments", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/services", { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const empData = await empRes.json().catch(() => ({}));
      const depData = await depRes.json().catch(() => ({}));
      const svcData = await svcRes.json().catch(() => ({}));

      const depMap: Record<string, string> = {};
      (depData?.departments ?? []).forEach((d: DepartmentApiItem) => {
        depMap[d.id] = d.name ?? d.type ?? d.id;
      });

      const svcMap: Record<string, string> = {};
      (svcData?.services ?? []).forEach((s: ServiceApiItem) => {
        svcMap[s.id] = s.name ?? s.type ?? s.id;
      });

      setDepartments(depMap);
      setServices(svcMap);

      const employees = (empData?.employees ?? []).map((e: Partial<EmployeeRow>) => ({
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          email: e.email,
          profilePhotoUrl: e.profilePhotoUrl ?? null,
          matricule: e.matricule,
          jobTitle: e.jobTitle,
          role: e.role ?? "EMPLOYEE",
          status: e.status ?? "ACTIVE",
          leaveBalance: e.leaveBalance ?? 25,
          annualLeaveBalance: e.annualLeaveBalance ?? e.leaveBalance ?? 25,
          departmentId: e.departmentId ?? null,
          serviceId: e.serviceId ?? null,
        }));
      setRows(employees.filter((e: EmployeeRow) => e.id !== currentEmployee?.id));
    } finally {
      setIsLoading(false);
    }
  }, [currentEmployee?.id]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  return (
    <div className="p-6">
      <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Tous les employés</div>
      <div className="text-sm text-vdm-gold-700 mb-4">Filtrer par rôle.</div>

      <div className="grid gap-3 mb-4 max-w-xs">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="w-full border border-vdm-gold-200 rounded-md p-2 bg-white focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
        >
          <option value="ALL">Tous les rôles</option>
          <option value="EMPLOYEE">Employé</option>
          <option value="DEPT_HEAD">Chef de département</option>
          <option value="SERVICE_HEAD">Directeur adjoint</option>
          <option value="ACCOUNTANT">Comptable</option>
          <option value="CEO">PDG</option>
        </select>
      </div>

      <DataTable
        data={filteredRows}
        columns={columns}
        searchPlaceholder="Rechercher un employé..."
        onRefresh={loadEmployees}
      />
      {isLoading ? <div className="mt-3 text-xs text-vdm-gold-700">Chargement des employés...</div> : null}

      {isBalanceModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeIncreaseModal} />
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <div className="text-lg font-semibold text-vdm-gold-800">Augmenter le solde</div>
            <div className="text-sm text-vdm-gold-700 mt-1">
              {selectedEmployee
                ? `Employé : ${selectedEmployee.firstName} ${selectedEmployee.lastName}`
                : "Employé sélectionné"}
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-vdm-gold-800 mb-1">
                Nombre de jours à ajouter
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={balanceInput}
                onChange={(e) => setBalanceInput(e.target.value)}
                className="w-full border border-vdm-gold-200 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                placeholder="Ex : 3"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeIncreaseModal}
                className="px-3 py-2 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmIncrease}
                className="px-3 py-2 rounded-md bg-vdm-gold-700 text-white text-sm hover:bg-vdm-gold-800"
              >
                Valider
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isEditModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeEditModal} />
          <div className="relative w-full max-w-2xl rounded-xl bg-white p-6 shadow-lg">
            <div className="text-lg font-semibold text-vdm-gold-800">Modifier l’utilisateur</div>
            <div className="text-sm text-vdm-gold-700 mt-1">
              {selectedEmployee ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}` : "Utilisateur"}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Prénom</label>
                <input
                  value={editForm.firstName}
                  onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))}
                  className="w-full border border-vdm-gold-200 rounded-md p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Nom</label>
                <input
                  value={editForm.lastName}
                  onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))}
                  className="w-full border border-vdm-gold-200 rounded-md p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full border border-vdm-gold-200 rounded-md p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Matricule</label>
                <input
                  value={editForm.matricule}
                  onChange={(e) => setEditForm((p) => ({ ...p, matricule: e.target.value }))}
                  className="w-full border border-vdm-gold-200 rounded-md p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Poste</label>
                <input
                  value={editForm.jobTitle}
                  onChange={(e) => setEditForm((p) => ({ ...p, jobTitle: e.target.value }))}
                  className="w-full border border-vdm-gold-200 rounded-md p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Rôle</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}
                  className="w-full border border-vdm-gold-200 rounded-md p-2 bg-white"
                >
                  <option value="EMPLOYEE">Employé</option>
                  <option value="DEPT_HEAD">Chef de département</option>
                  <option value="SERVICE_HEAD">Directeur adjoint</option>
                  <option value="ACCOUNTANT">Comptable</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Statut</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}
                  className="w-full border border-vdm-gold-200 rounded-md p-2 bg-white"
                >
                  <option value="ACTIVE">Actif</option>
                  <option value="PENDING">En attente</option>
                  <option value="REJECTED">Rejeté</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Département</label>
                <select
                  value={editForm.departmentId}
                  onChange={(e) => {
                    const nextDept = e.target.value;
                    const nextType = nextDept ? String(departments[nextDept] ?? "") : "";
                    setEditForm((p) => ({
                      ...p,
                      departmentId: nextDept,
                      serviceId: nextType === "OPERATIONS" ? p.serviceId : "",
                    }));
                  }}
                  className="w-full border border-vdm-gold-200 rounded-md p-2 bg-white"
                >
                  {Object.keys(departments).length === 0 ? (
                    <option value="">Chargement...</option>
                  ) : (
                    Object.entries(departments).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {showServiceField ? (
                <div>
                  <label className="block text-sm font-medium text-vdm-gold-800 mb-1">Service</label>
                  <select
                    value={editForm.serviceId}
                    onChange={(e) => setEditForm((p) => ({ ...p, serviceId: e.target.value }))}
                    className="w-full border border-vdm-gold-200 rounded-md p-2 bg-white"
                  >
                    {Object.entries(services).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeEditModal}
                className="px-3 py-2 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmEdit}
                className="px-3 py-2 rounded-md bg-vdm-gold-700 text-white text-sm hover:bg-vdm-gold-800"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
