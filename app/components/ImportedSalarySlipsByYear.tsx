"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getToken } from "@/lib/auth-client";
import {
  MONTH_LABELS,
  SalarySlip,
  formatDate,
  formatDateTime,
  groupSlipsByYearMonth,
  toPeriod,
} from "@/app/components/salary-slip-utils";

export default function ImportedSalarySlipsByYear() {
  const [slips, setSlips] = useState<SalarySlip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [historyYearFilter, setHistoryYearFilter] = useState("ALL");
  const [employeeFilter, setEmployeeFilter] = useState("ALL");
  const [employees, setEmployees] = useState<{ id: string; label: string }[]>([]);
  const [isEmployeesLoading, setIsEmployeesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const token = getToken();
    if (!token) {
      setError("Session invalide");
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/salary-slips", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(data?.error ?? "Impossible de charger les bulletins"));
        return;
      }
      setSlips(Array.isArray(data?.slips) ? data.slips : []);
    } catch {
      setError("Erreur réseau lors du chargement");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const loadEmployees = async () => {
      setIsEmployeesLoading(true);
      const token = getToken();
      if (!token) {
        setEmployees([]);
        setIsEmployeesLoading(false);
        return;
      }
      try {
        const res = await fetch("/api/employees/options?take=150", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setEmployees([]);
          return;
        }
        const list = Array.isArray(data?.employees) ? data.employees : [];
        const formatted = list
          .flatMap((emp: { id?: string; firstName?: string; lastName?: string }) => {
            if (!emp?.id) return [];
            return [
              {
                id: String(emp.id),
                label: `${emp.lastName ?? ""} ${emp.firstName ?? ""}`.trim(),
              },
            ];
          })
          .filter((emp: { label: string | any[]; }) => emp.label.length > 0)
          .sort((a: { label: string; }, b: { label: any; }) => a.label.localeCompare(b.label));
        setEmployees(formatted);
      } finally {
        setIsEmployeesLoading(false);
      }
    };

    loadEmployees();
  }, []);

  const sortedSlips = useMemo(
    () =>
      [...slips].sort((a, b) => {
        const tA = new Date(a.createdAt).getTime();
        const tB = new Date(b.createdAt).getTime();
        if (!Number.isNaN(tA) && !Number.isNaN(tB)) return tB - tA;
        return String(b.createdAt).localeCompare(String(a.createdAt));
      }),
    [slips]
  );

  const signedSlipsForGrouping = useMemo(() => {
    const signedSlips = sortedSlips.filter((slip) => Boolean(slip.signedAt));
    if (employeeFilter === "ALL") return signedSlips;
    return signedSlips.filter((slip) => slip.employeeId === employeeFilter);
  }, [sortedSlips, employeeFilter]);

  const signedSlipsByYear = useMemo(() => {
    return groupSlipsByYearMonth(signedSlipsForGrouping);
  }, [signedSlipsForGrouping]);

  const historyYears = useMemo(
    () => Array.from(new Set(signedSlipsByYear.map((group) => String(group.year)))).sort((a, b) => Number(b) - Number(a)),
    [signedSlipsByYear]
  );

  const filteredSignedSlipsByYear = useMemo(() => {
    if (historyYearFilter === "ALL") return signedSlipsByYear;
    const y = Number(historyYearFilter);
    if (!Number.isInteger(y)) return signedSlipsByYear;
    return signedSlipsByYear.filter((group) => group.year === y);
  }, [historyYearFilter, signedSlipsByYear]);

  useEffect(() => {
    if (employeeFilter === "ALL") return;
    if (!employees.some((emp) => emp.id === employeeFilter)) {
      setEmployeeFilter("ALL");
    }
  }, [employees, employeeFilter]);

  const downloadSlip = useCallback(
    async (slip: SalarySlip) => {
      setError(null);
      const token = getToken();
      if (!token) {
        setError("Session invalide");
        return;
      }
      setDownloadingId(slip.id);
      try {
        const res = await fetch(`/api/salary-slips/${slip.id}/file`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(String(data?.error ?? "Impossible de télécharger le bulletin"));
          return;
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = slip.fileName;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
      } catch {
        setError("Erreur réseau lors du téléchargement");
      } finally {
        setDownloadingId(null);
      }
    },
    []
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-vdm-gold-900">Bulletins importés par année</h1>
          <p className="text-sm text-vdm-gold-700">Retrouvez l'historique des bulletins signés.</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="px-3 py-2 rounded-lg border border-vdm-gold-300 text-sm text-vdm-gold-800 hover:bg-vdm-gold-50"
        >
          Rafraîchir
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="rounded-xl border border-vdm-gold-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-vdm-gold-100">
          <h2 className="text-base font-semibold text-vdm-gold-900">Bulletins importés par année</h2>
        </div>

        <div className="px-4 py-3 border-b border-vdm-gold-100 bg-vdm-gold-50/30 space-y-3">
          <label className="text-sm text-vdm-gold-900">
            Filtrer par année
            <select
              value={historyYearFilter}
              onChange={(event) => setHistoryYearFilter(event.target.value)}
              className="mt-1 w-full sm:w-64 rounded-lg border border-vdm-gold-300 px-3 py-2 bg-white"
            >
              <option value="ALL">Toutes</option>
              {historyYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          {' '}
          <label className="text-sm text-vdm-gold-900">
            Filtrer par employé
            <select
              value={employeeFilter}
              onChange={(event) => setEmployeeFilter(event.target.value)}
              className="mt-1 w-full sm:w-64 rounded-lg border border-vdm-gold-300 px-3 py-2 bg-white"
              disabled={isEmployeesLoading}
            >
              <option value="ALL">{isEmployeesLoading ? "Chargement..." : "Tous les employés"}</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isLoading ? (
          <div className="p-4 text-sm text-gray-600">Chargement...</div>
        ) : filteredSignedSlipsByYear.length === 0 ? (
          <div className="p-4 text-sm text-gray-600">Aucun bulletin signé.</div>
        ) : (
          <div className="divide-y divide-vdm-gold-100">
            {filteredSignedSlipsByYear.map((group) => (
              <details key={group.year}>
                <summary className="list-none px-4 py-3 bg-vdm-gold-50 text-vdm-gold-900 font-semibold flex items-center justify-between">
                  <span>Année {group.year}</span>
                  <span className="text-xs text-vdm-gold-700">
                    {group.months.reduce((total, month) => total + month.slips.length, 0)} bulletin(s)
                  </span>
                </summary>

                <div className="divide-y divide-vdm-gold-100">
                  {group.months.map((monthGroup) => (
                    <details key={`${group.year}-${monthGroup.month}`}>
                      <summary className="list-none px-4 py-3 bg-vdm-gold-50/40 text-vdm-gold-900 font-medium flex items-center justify-between">
                        <span>{MONTH_LABELS[monthGroup.month - 1] ?? `Mois ${monthGroup.month}`}</span>
                        <span className="text-xs text-vdm-gold-700">{monthGroup.slips.length} bulletin(s)</span>
                      </summary>

                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-vdm-gold-50/60 text-vdm-gold-900">
                            <tr>
                              <th className="px-4 py-3 text-left font-semibold">Employé</th>
                              <th className="px-4 py-3 text-left font-semibold">Période</th>
                              <th className="px-4 py-3 text-left font-semibold">Fichier</th>
                              <th className="px-4 py-3 text-left font-semibold">Statut de signature</th>
                              <th className="px-4 py-3 text-left font-semibold">Date d'import</th>
                              <th className="px-4 py-3 text-right font-semibold">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {monthGroup.slips.map((slip) => (
                              <tr key={slip.id} className="border-t border-vdm-gold-100">
                                <td className="px-4 py-3">
                                  {slip.employee
                                    ? `${slip.employee.lastName} ${slip.employee.firstName}${
                                        slip.employee.matricule ? ` (${slip.employee.matricule})` : ""
                                      }`
                                    : "-"}
                                </td>
                                <td className="px-4 py-3">{toPeriod(slip.year, slip.month)}</td>
                                <td className="px-4 py-3">{slip.fileName}</td>
                                <td className="px-4 py-3">
                                  {slip.signedAt
                                    ? `Signé par ${slip.signedBy?.firstName ?? "PDG"} ${slip.signedBy?.lastName ?? ""} le ${formatDateTime(
                                        slip.signedAt
                                      )}`.trim()
                                    : "En attente de signature du PDG"}
                                </td>
                                <td className="px-4 py-3">{formatDate(slip.createdAt)}</td>
                                <td className="px-4 py-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => downloadSlip(slip)}
                                    disabled={downloadingId === slip.id}
                                    className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 hover:bg-vdm-gold-50 disabled:opacity-60"
                                  >
                                    {downloadingId === slip.id ? "Téléchargement..." : "Télécharger"}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
