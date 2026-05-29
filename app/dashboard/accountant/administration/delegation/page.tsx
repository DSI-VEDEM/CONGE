"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import EmployeeAvatar from "@/app/components/EmployeeAvatar";
import { getToken } from "@/lib/auth-client";

type DafPermissions = {
  holidays: boolean;
  leaveBalance: boolean;
  contractDocuments: boolean;
};

type DafEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  matricule?: string | null;
  jobTitle?: string | null;
  role: string;
  profilePhotoUrl?: string | null;
  dafPermissions?: DafPermissions | null;
};

const emptyPermissions: DafPermissions = {
  holidays: false,
  leaveBalance: false,
  contractDocuments: false,
};

function hasAnyPermission(permissions?: DafPermissions | null) {
  return Boolean(permissions?.holidays || permissions?.leaveBalance || permissions?.contractDocuments);
}

function fullName(employee: DafEmployee) {
  return `${employee.firstName} ${employee.lastName}`.trim() || employee.email;
}

export default function DafDelegationPage() {
  const [employees, setEmployees] = useState<DafEmployee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [permissions, setPermissions] = useState<DafPermissions>(emptyPermissions);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId]
  );

  const activeDelegate = useMemo(
    () => employees.find((employee) => hasAnyPermission(employee.dafPermissions)) ?? null,
    [employees]
  );

  const loadDelegation = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/daf/delegation", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(data?.error ?? "Impossible de charger la délégation DAF"));
        return;
      }
      const list = Array.isArray(data?.employees) ? (data.employees as DafEmployee[]) : [];
      setEmployees(list);
      const current = list.find((employee) => hasAnyPermission(employee.dafPermissions)) ?? list[0] ?? null;
      setSelectedEmployeeId(current?.id ?? "");
      setPermissions(current?.dafPermissions ?? emptyPermissions);
    } catch {
      toast.error("Erreur réseau pendant le chargement");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDelegation();
  }, [loadDelegation]);

  const selectEmployee = (employee: DafEmployee) => {
    if (isSaving) return;
    setSelectedEmployeeId(employee.id);
    setPermissions(employee.dafPermissions ?? emptyPermissions);
  };

  const updatePermission = (key: keyof DafPermissions, value: boolean) => {
    setPermissions((prev) => ({ ...prev, [key]: value }));
  };

  const saveDelegation = async (nextPermissions = permissions) => {
    if (!selectedEmployeeId) {
      toast.error("Sélectionnez un membre DAF.");
      return;
    }
    const token = getToken();
    if (!token) return;
    setIsSaving(true);
    const t = toast.loading("Enregistrement de la délégation...");
    try {
      const res = await fetch("/api/daf/delegation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          ...nextPermissions,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(data?.error ?? "Impossible d'enregistrer la délégation"), { id: t });
        return;
      }
      toast.success(
        hasAnyPermission(nextPermissions) ? "Délégation DAF mise à jour" : "Délégation DAF retirée",
        { id: t }
      );
      await loadDelegation();
    } catch {
      toast.error("Erreur réseau pendant l'enregistrement", { id: t });
    } finally {
      setIsSaving(false);
    }
  };

  const revokeDelegation = () => {
    const next = { ...emptyPermissions };
    setPermissions(next);
    void saveDelegation(next);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Délégation DAF</div>
        <p className="text-sm text-vdm-gold-700">
          Sélectionnez un membre actif du DAF et les tâches administratives qu'il pourra traiter.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="bg-white border border-vdm-gold-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-vdm-gold-100 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-vdm-gold-900">Membres du département</div>
              <div className="text-xs text-vdm-gold-600">
                {isLoading ? "Chargement..." : `${employees.length} collaborateur(s) actif(s)`}
              </div>
            </div>
            <button
              type="button"
              onClick={loadDelegation}
              className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-xs text-vdm-gold-800 hover:bg-vdm-gold-50 disabled:opacity-60"
              disabled={isLoading || isSaving}
            >
              Rafraîchir
            </button>
          </div>

          <div className="divide-y divide-vdm-gold-100">
            {employees.length === 0 ? (
              <div className="p-5 text-sm text-vdm-gold-700">Aucun membre DAF actif trouvé.</div>
            ) : (
              employees.map((employee) => {
                const isSelected = employee.id === selectedEmployeeId;
                const isDelegate = hasAnyPermission(employee.dafPermissions);
                return (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => selectEmployee(employee)}
                    className={`w-full px-4 py-3 text-left flex items-center gap-3 transition ${
                      isSelected ? "bg-vdm-gold-50" : "bg-white hover:bg-vdm-gold-50/60"
                    }`}
                    disabled={isSaving}
                  >
                    <EmployeeAvatar
                      firstName={employee.firstName}
                      lastName={employee.lastName}
                      profilePhotoUrl={employee.profilePhotoUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-vdm-gold-900 truncate">{fullName(employee)}</div>
                      <div className="text-xs text-vdm-gold-700 truncate">
                        {employee.jobTitle || employee.email}
                      </div>
                      <div className="text-xs text-gray-500">{employee.matricule ?? employee.role}</div>
                    </div>
                    {isDelegate ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                        Délégué
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="bg-white border border-vdm-gold-200 rounded-xl p-5 space-y-4">
          <div>
            <div className="text-base font-semibold text-vdm-gold-900">Tâches confiées</div>
            <div className="text-xs text-vdm-gold-600 mt-1">
              {selectedEmployee ? fullName(selectedEmployee) : "Aucun membre sélectionné"}
            </div>
          </div>

          {activeDelegate ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Délégué actuel : {fullName(activeDelegate)}
            </div>
          ) : (
            <div className="rounded-lg border border-vdm-gold-200 bg-vdm-gold-50 px-3 py-2 text-xs text-vdm-gold-800">
              Aucun délégué DAF actif.
            </div>
          )}

          <div className="space-y-3">
            <label className="flex items-start gap-3 rounded-lg border border-vdm-gold-200 p-3 text-sm text-vdm-gold-900">
              <input
                type="checkbox"
                checked={permissions.holidays}
                onChange={(e) => updatePermission("holidays", e.target.checked)}
                className="mt-1 h-4 w-4 accent-vdm-gold-700"
                disabled={!selectedEmployee || isSaving}
              />
              <span>
                <span className="block font-semibold">Jours fériés</span>
                <span className="block text-xs text-vdm-gold-600">Ajouter ou supprimer les jours fériés.</span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-lg border border-vdm-gold-200 p-3 text-sm text-vdm-gold-900">
              <input
                type="checkbox"
                checked={permissions.leaveBalance}
                onChange={(e) => updatePermission("leaveBalance", e.target.checked)}
                className="mt-1 h-4 w-4 accent-vdm-gold-700"
                disabled={!selectedEmployee || isSaving}
              />
              <span>
                <span className="block font-semibold">Ajuster solde</span>
                <span className="block text-xs text-vdm-gold-600">
                  Mettre à jour les jours déjà consommés sur le cycle courant.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-lg border border-vdm-gold-200 p-3 text-sm text-vdm-gold-900">
              <input
                type="checkbox"
                checked={permissions.contractDocuments}
                onChange={(e) => updatePermission("contractDocuments", e.target.checked)}
                className="mt-1 h-4 w-4 accent-vdm-gold-700"
                disabled={!selectedEmployee || isSaving}
              />
              <span>
                <span className="block font-semibold">Documents contractuels</span>
                <span className="block text-xs text-vdm-gold-600">
                  Ajouter les types et déposer les documents contractuels.
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => void saveDelegation()}
              className="px-4 py-2 rounded-md bg-vdm-gold-700 text-white text-sm font-semibold hover:bg-vdm-gold-800 disabled:opacity-60"
              disabled={!selectedEmployee || isSaving}
            >
              {isSaving ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={revokeDelegation}
              className="px-4 py-2 rounded-md border border-red-300 text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-60"
              disabled={!selectedEmployee || isSaving || !hasAnyPermission(permissions)}
            >
              Retirer
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
