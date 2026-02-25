"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getToken } from "@/lib/auth-client";
import {
  MONTH_LABELS,
  SalarySlip,
  toPeriod,
  formatDate,
  formatDateTime,
} from "@/app/components/salary-slip-utils";

type EmployeeItem = {
  id: string;
  firstName: string;
  lastName: string;
  matricule?: string | null;
  email: string;
};

type RawEmployeeItem = {
  id?: string;
  firstName?: string;
  lastName?: string;
  matricule?: string | null;
  email?: string;
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Impossible de lire le fichier"));
    reader.readAsDataURL(file);
  });
}

export default function SalarySlipsAdmin() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [slips, setSlips] = useState<SalarySlip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [recentPage, setRecentPage] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [isUploadPreviewOpen, setIsUploadPreviewOpen] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refreshEmployees = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    const res = await fetch("/api/employees/options?take=150", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(String(data?.error ?? "Impossible de charger la liste des employés"));
      return;
    }

    const list = Array.isArray(data?.employees) ? data.employees : [];
    setEmployees(
      list
        .flatMap((emp: RawEmployeeItem) => {
          if (!emp?.id) return [];
          return [
            {
              id: String(emp.id),
              firstName: String(emp.firstName ?? ""),
              lastName: String(emp.lastName ?? ""),
              matricule: emp.matricule ?? null,
              email: String(emp.email ?? ""),
            },
          ];
        })
        .sort((a: EmployeeItem, b: EmployeeItem) =>
          `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
        )
    );
  }, []);

  const refreshSlips = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    const res = await fetch("/api/salary-slips", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(String(data?.error ?? "Impossible de charger les bulletins"));
      return;
    }

    setSlips(Array.isArray(data?.slips) ? data.slips : []);
  }, []);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await Promise.all([refreshEmployees(), refreshSlips()]);
    } finally {
      setIsLoading(false);
    }
  }, [refreshEmployees, refreshSlips]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!file || file.type !== "application/pdf") {
      setUploadPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUploadPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const upload = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    if (!employeeId || !month || !year || !file) {
      setError("Sélectionnez un employé, un mois, une année et un PDF.");
      return;
    }

    if (file.type !== "application/pdf") {
      setError("Le bulletin doit être au format PDF.");
      return;
    }
    const yearNumber = Number(year);
    if (!Number.isInteger(yearNumber) || yearNumber > currentYear) {
      setError(`L'année du bulletin ne doit pas dépasser ${currentYear}.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const fileDataUrl = await fileToDataUrl(file);

      const res = await fetch("/api/salary-slips", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId,
          month: Number(month),
          year: yearNumber,
          fileName: file.name,
          fileDataUrl,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(data?.error ?? "Import impossible"));
        return;
      }

      setSuccess("Bulletin importé avec succès.");
      setFile(null);
      setIsUploadPreviewOpen(false);
      await refreshSlips();
    } catch {
      setError("Erreur réseau");
    } finally {
      setIsSubmitting(false);
    }
  }, [employeeId, month, year, file, refreshSlips, currentYear]);

  const downloadSlip = useCallback(async (id: string) => {
    const token = getToken();
    if (!token) return;

    setDownloadingId(id);
    try {
      const res = await fetch(`/api/salary-slips/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(data?.error ?? "Impossible de télécharger le bulletin"));
        return;
      }

      const slip = data?.slip;
      if (!slip?.fileDataUrl || !slip?.fileName) {
        setError("Fichier indisponible");
        return;
      }
      const fileName = slip.signedAt
        ? String(slip.fileName).replace(/\.pdf$/i, "-signe.pdf")
        : String(slip.fileName);
      const a = document.createElement("a");
      a.href = slip.fileDataUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setError("Erreur réseau");
    } finally {
      setDownloadingId(null);
    }
  }, []);

  const removeSlip = useCallback(
    async (id: string) => {
      const token = getToken();
      if (!token) return;

      const confirmed = window.confirm("Retirer ce bulletin non signé ?");
      if (!confirmed) return;

      setRemovingId(id);
      setError(null);
      setSuccess(null);

      try {
        const res = await fetch(`/api/salary-slips/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(String(data?.error ?? "Impossible de retirer le bulletin"));
          return;
        }

        setSuccess("Bulletin retiré avec succès.");
        await refreshSlips();
      } catch {
        setError("Erreur réseau");
      } finally {
        setRemovingId(null);
      }
    },
    [refreshSlips]
  );

  const employeeOptions = useMemo(
    () =>
      employees.map((emp) => ({
        id: emp.id,
        label: `${emp.lastName} ${emp.firstName}${emp.matricule ? ` (${emp.matricule})` : ""}`,
      })),
    [employees]
  );
  const selectedYear = Number(year);
  const selectedMonth = Number(month);

  const importedEmployeeIdsForSelectedPeriod = useMemo(() => {
    if (!Number.isInteger(selectedYear) || !Number.isInteger(selectedMonth)) return new Set<string>();
    const ids = slips
      .filter((slip) => slip.year === selectedYear && slip.month === selectedMonth)
      .map((slip) => slip.employeeId);
    return new Set(ids);
  }, [slips, selectedYear, selectedMonth]);

  const availableEmployeeOptions = useMemo(
    () => employeeOptions.filter((emp) => !importedEmployeeIdsForSelectedPeriod.has(emp.id)),
    [employeeOptions, importedEmployeeIdsForSelectedPeriod]
  );

  const importedCountByMonth = useMemo(() => {
    const byMonth = new Map<number, Set<string>>();
    if (!Number.isInteger(selectedYear)) return byMonth;
    for (const slip of slips) {
      if (slip.year !== selectedYear) continue;
      const set = byMonth.get(slip.month) ?? new Set<string>();
      set.add(slip.employeeId);
      byMonth.set(slip.month, set);
    }
    return byMonth;
  }, [slips, selectedYear]);

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

  const pendingSlips = useMemo(() => sortedSlips.filter((slip) => !slip.signedAt), [sortedSlips]);
  const RECENT_PAGE_SIZE = 5;
  const recentTotalPages = Math.max(1, Math.ceil(pendingSlips.length / RECENT_PAGE_SIZE));
  const recentSlips = useMemo(() => {
    const start = (recentPage - 1) * RECENT_PAGE_SIZE;
    return pendingSlips.slice(start, start + RECENT_PAGE_SIZE);
  }, [pendingSlips, recentPage]);

  useEffect(() => {
    if (!employeeId) return;
    const stillAvailable = availableEmployeeOptions.some((emp) => emp.id === employeeId);
    if (!stillAvailable) setEmployeeId("");
  }, [availableEmployeeOptions, employeeId]);

  useEffect(() => {
    if (recentPage > recentTotalPages) setRecentPage(recentTotalPages);
  }, [recentPage, recentTotalPages]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-vdm-gold-900">Administration des bulletins</h1>
          <p className="text-sm text-vdm-gold-700">Import des bulletins, puis signature par le PDG.</p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          className="px-3 py-2 rounded-lg border border-vdm-gold-300 text-sm text-vdm-gold-800 hover:bg-vdm-gold-50"
        >
          Rafraîchir
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{success}</div>
      )}

      <section className="rounded-xl border border-vdm-gold-200 bg-white p-4 space-y-4">
        <h2 className="text-base font-semibold text-vdm-gold-900">Nouveau bulletin</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-vdm-gold-900">
            Année
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="mt-1 w-full rounded-lg border border-vdm-gold-300 px-3 py-2"
              min={2000}
              max={currentYear}
              disabled={isSubmitting}
            />
          </label>

          <label className="text-sm text-vdm-gold-900">
            Employé
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-vdm-gold-300 px-3 py-2"
              disabled={isLoading || isSubmitting}
            >
              <option value="">
                {availableEmployeeOptions.length === 0 ? "Aucun employé disponible" : "Sélectionner..."}
              </option>
              {availableEmployeeOptions.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <div className="text-sm text-vdm-gold-900 mb-2">
            Mois du bulletin ({Number.isInteger(selectedYear) ? selectedYear : "année invalide"})
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {MONTH_LABELS.map((label, idx) => {
              const m = idx + 1;
              const selected = String(m) === month;
              const importedCount = importedCountByMonth.get(m)?.size ?? 0;
              const availableCount = Math.max(employees.length - importedCount, 0);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setMonth(String(m))}
                  disabled={isSubmitting}
                  className={`rounded-lg border px-3 py-2 text-left ${
                    selected
                      ? "border-vdm-gold-700 bg-vdm-gold-100 text-vdm-gold-900"
                      : "border-vdm-gold-200 bg-white text-vdm-gold-800 hover:bg-vdm-gold-50"
                  }`}
                >
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="text-xs text-vdm-gold-700">{availableCount} disponible(s)</div>
                </button>
              );
            })}
          </div>
        </div>

        <label className="text-sm text-vdm-gold-900 block">
          Bulletin (PDF)
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setIsUploadPreviewOpen(false);
            }}
            className="mt-1 block w-full rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-blue-700"
            disabled={isSubmitting}
          />
        </label>

        {file ? (
          <div className="rounded-lg border border-vdm-gold-200 bg-white p-3">
            <div className="text-sm font-medium text-vdm-gold-900">Fichier sélectionné: {file.name}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsUploadPreviewOpen(true)}
                disabled={!uploadPreviewUrl}
                className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50 disabled:opacity-60"
              >
                Aperçu du bulletin
              </button>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setIsUploadPreviewOpen(false);
                }}
                className="px-3 py-1.5 rounded-md border border-red-300 text-red-700 text-sm hover:bg-red-50"
              >
                Retirer le fichier
              </button>
            </div>
          </div>
        ) : null}

        <div>
          <button
            type="button"
            onClick={upload}
            disabled={isSubmitting || !employeeId || availableEmployeeOptions.length === 0}
            className="px-4 py-2 rounded-lg bg-vdm-gold-800 text-white hover:bg-vdm-gold-700 disabled:opacity-60"
          >
            {isSubmitting ? "Import en cours..." : "Importer le bulletin"}
          </button>
        </div>
      </section>

      {isUploadPreviewOpen && uploadPreviewUrl ? (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 md:p-8" onClick={() => setIsUploadPreviewOpen(false)}>
          <div
            className="mx-auto h-full w-full max-w-6xl rounded-xl bg-white shadow-xl flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-vdm-gold-100 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-vdm-gold-900">Aperçu du bulletin avant import</h3>
                <p className="text-xs text-vdm-gold-700">{file?.name ?? "Bulletin PDF"}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadPreviewOpen(false)}
                className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 hover:bg-vdm-gold-50"
              >
                Fermer
              </button>
            </div>
            <div className="p-4 h-full min-h-0">
              <iframe className="h-full w-full rounded-lg border border-vdm-gold-200 bg-white" src={uploadPreviewUrl} title="Aperçu bulletin avant import" />
            </div>
          </div>
        </div>
      ) : null}

      <section className="rounded-xl border border-vdm-gold-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-vdm-gold-100">
          <h2 className="text-base font-semibold text-vdm-gold-900">Bulletins en attente de signature</h2>
        </div>

        {isLoading ? (
          <div className="p-4 text-sm text-gray-600">Chargement...</div>
        ) : recentSlips.length === 0 ? (
          <div className="p-4 text-sm text-gray-600">Aucun bulletin en attente de signature.</div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-vdm-gold-50 text-vdm-gold-900">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Employé</th>
                    <th className="px-4 py-3 text-left font-semibold">Période</th>
                    <th className="px-4 py-3 text-left font-semibold">Date d&apos;import</th>
                    <th className="px-4 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSlips.map((slip) => (
                    <tr key={slip.id} className="border-t border-vdm-gold-100">
                      <td className="px-4 py-3">
                        {slip.employee
                          ? `${slip.employee.lastName} ${slip.employee.firstName}${
                              slip.employee.matricule ? ` (${slip.employee.matricule})` : ""
                            }`
                          : "-"}
                      </td>
                      <td className="px-4 py-3">{toPeriod(slip.year, slip.month)}</td>
                      <td className="px-4 py-3">{formatDateTime(slip.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => downloadSlip(slip.id)}
                          disabled={downloadingId === slip.id || removingId === slip.id}
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

            <div className="px-4 py-3 border-t border-vdm-gold-100 flex items-center justify-between">
              <div className="text-xs text-vdm-gold-700">
                Page {recentPage} / {recentTotalPages}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRecentPage((p) => Math.max(1, p - 1))}
                  disabled={recentPage <= 1}
                  className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50 disabled:opacity-60"
                >
                  Précédent
                </button>
                <button
                  type="button"
                  onClick={() => setRecentPage((p) => Math.min(recentTotalPages, p + 1))}
                  disabled={recentPage >= recentTotalPages}
                  className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50 disabled:opacity-60"
                >
                  Suivant
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
