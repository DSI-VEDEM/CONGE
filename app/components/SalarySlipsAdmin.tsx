"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { getToken } from "@/lib/auth-client";
import {
  MONTH_LABELS,
  SalarySlip,
  toPeriod,
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
  role?: string | null;
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Impossible de lire le fichier"));
    reader.readAsDataURL(file);
  });
}

export default function SalarySlipsAdmin({ showIndividualImport = true }: { showIndividualImport?: boolean }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [slips, setSlips] = useState<SalarySlip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [masterIsSubmitting, setMasterIsSubmitting] = useState(false);
  const [previewSlipId, setPreviewSlipId] = useState<string | null>(null);
  const [previewSlipUrl, setPreviewSlipUrl] = useState<string | null>(null);
  const [previewSlipFileName, setPreviewSlipFileName] = useState<string>("");
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ id: string; fileName: string } | null>(null);
  const [importPreviewFile, setImportPreviewFile] = useState<File | null>(null);
  const [importPreviewUrl, setImportPreviewUrl] = useState<string | null>(null);
  const [selectedImportFileKeys, setSelectedImportFileKeys] = useState<Set<string>>(new Set());

  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [recentPage, setRecentPage] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [isUploadPreviewOpen, setIsUploadPreviewOpen] = useState(false);
  const [masterPdfs, setMasterPdfs] = useState<File[]>([]);


  const refreshEmployees = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    // GET /api/employees/options?take=150 pour peupler la liste déroulante.
    const res = await fetch("/api/employees/options?take=150", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(String(data?.error ?? "Impossible de charger la liste des employés"));
      return;
    }

    const list = Array.isArray(data?.employees) ? data.employees : [];
    setEmployees(
      list
        .flatMap((emp: RawEmployeeItem) => {
          if (!emp?.id) return [];
          if (emp.role === "CEO") return [];
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

    // GET /api/salary-slips pour afficher les bulletins disponibles.
    const res = await fetch("/api/salary-slips", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(String(data?.error ?? "Impossible de charger les bulletins"));
      return;
    }

    setSlips(Array.isArray(data?.slips) ? data.slips : []);
  }, []);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([showIndividualImport ? refreshEmployees() : Promise.resolve(), refreshSlips()]);
    } finally {
      setIsLoading(false);
    }
  }, [refreshEmployees, refreshSlips, showIndividualImport]);

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

  useEffect(() => {
    if (!importPreviewFile) {
      setImportPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(importPreviewFile);
    setImportPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [importPreviewFile]);

  const importFileKey = useCallback((f: File) => `${f.name}__${f.size}__${f.lastModified}`, []);

  const removeFilesByKeys = useCallback(
    (keys: Set<string>) => {
      if (keys.size === 0) return;
      setMasterPdfs((prev) => prev.filter((f) => !keys.has(importFileKey(f))));
      setSelectedImportFileKeys(new Set());
      if (importPreviewFile && keys.has(importFileKey(importPreviewFile))) {
        setImportPreviewFile(null);
      }
    },
    [importFileKey, importPreviewFile]
  );

  const toggleImportFileSelected = useCallback(
    (key: string) => {
      setSelectedImportFileKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    []
  );

  const clearImportList = useCallback(() => {
    setMasterPdfs([]);
    setSelectedImportFileKeys(new Set());
    setImportPreviewFile(null);
  }, []);

  const upload = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    if (!employeeId || !month || !year || !file) {
      toast.error("Sélectionnez un employé, un mois, une année et un PDF.");
      return;
    }

    if (file.type !== "application/pdf") {
      toast.error("Le bulletin doit être au format PDF.");
      return;
    }
    const yearNumber = Number(year);
    if (!Number.isInteger(yearNumber) || yearNumber > currentYear) {
      toast.error(`L'année du bulletin ne doit pas dépasser ${currentYear}.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const fileDataUrl = await fileToDataUrl(file);

      // POST /api/salary-slips pour uploader un nouveau bulletin PDF.
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
        toast.error(String(data?.error ?? "Import impossible"));
        return;
      }

      toast.success("Bulletin importé avec succès.");
      setFile(null);
      setIsUploadPreviewOpen(false);
      await refreshSlips();
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setIsSubmitting(false);
    }
  }, [employeeId, month, year, file, refreshSlips, currentYear]);

  const importMultiplePdfs = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    if (masterPdfs.length === 0) {
      toast.error("Sélectionnez au moins un PDF.");
      return;
    }

    setMasterIsSubmitting(true);
    const loadingToast = toast.loading("Analyse des PDFs en cours...");
    try {
      const form = new FormData();
      for (const f of masterPdfs) {
        form.append("pdfs", f, f.name);
      }

      const res = await fetch("/api/salary-slips/import-multiple-pdfs", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(data?.error ?? "Import impossible"), { id: loadingToast });
        const errors = Array.isArray(data?.errors) ? data.errors : [];
        const conflicts = Array.isArray(data?.conflicts) ? data.conflicts : [];
        if (errors.length && errors[0]?.fileName && errors[0]?.error) {
          toast(`Exemple: ${errors[0].fileName} — ${errors[0].error}`);
        } else if (conflicts.length && conflicts[0]?.matricule) {
          const c = conflicts[0];
          toast(`Déjà importé: ${c.matricule} (${String(c.month).padStart(2, "0")}/${c.year})`);
        }
        return;
      }

      const created = Number(data?.createdCount ?? 0);
      toast.success(`Import terminé: ${created} bulletin(s) créé(s) (à signer par le PDG).`, {
        id: loadingToast,
      });

      setMasterPdfs([]);
      setSelectedImportFileKeys(new Set());
      await refreshSlips();
    } catch {
      toast.error("Erreur réseau", { id: loadingToast });
    } finally {
      setMasterIsSubmitting(false);
    }
  }, [masterPdfs, refreshSlips]);

  const openSlipPreview = useCallback(async (id: string) => {
    const token = getToken();
    if (!token) return;

    setPreviewLoadingId(id);
    try {
      const res = await fetch(`/api/salary-slips/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(data?.error ?? "Impossible d'ouvrir l'aperçu"));
        return;
      }
      const slip = data?.slip;
      if (!slip?.fileDataUrl || !slip?.fileName) {
        toast.error("Fichier indisponible");
        return;
      }
      setPreviewSlipId(id);
      setPreviewSlipUrl(String(slip.fileDataUrl));
      setPreviewSlipFileName(String(slip.fileName));
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setPreviewLoadingId(null);
    }
  }, []);

  const requestDeleteSlip = useCallback((id: string, fileName: string) => {
    setDeleteModal({ id, fileName });
  }, []);

  const confirmDeleteSlip = useCallback(
    async (id: string) => {
      const token = getToken();
      if (!token) return;

      setDeletingId(id);
      try {
        const res = await fetch(`/api/salary-slips/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(String(data?.error ?? "Suppression impossible"));
          return;
        }
        toast.success("Bulletin supprimé.");
        if (previewSlipId === id) {
          setPreviewSlipId(null);
          setPreviewSlipUrl(null);
          setPreviewSlipFileName("");
        }
        setDeleteModal(null);
        await refreshSlips();
      } catch {
        toast.error("Erreur réseau");
      } finally {
        setDeletingId(null);
      }
    },
    [previewSlipId, refreshSlips]
  );

  const downloadSlip = useCallback(async (id: string) => {
    const token = getToken();
    if (!token) return;

    setDownloadingId(id);
    try {
      // GET /api/salary-slips/:id pour récupérer le PDF signé ou non signé.
      const res = await fetch(`/api/salary-slips/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(data?.error ?? "Impossible de télécharger le bulletin"));
        return;
      }

      const slip = data?.slip;
      if (!slip?.fileDataUrl || !slip?.fileName) {
        toast.error("Fichier indisponible");
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
      toast.error("Erreur réseau");
    } finally {
      setDownloadingId(null);
    }
  }, []);

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
    <div className="p-12 space-y-6">
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

      <section className="rounded-xl border border-vdm-gold-200 bg-white p-4 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-vdm-gold-900">Import (multi-sélection de PDFs)</h2>
          <p className="text-sm text-vdm-gold-700">
            Sélectionne plusieurs PDFs d&apos;un coup. Le système lit uniquement le <span className="font-medium">nom du fichier</span>{" "}
            pour trouver <span className="font-medium">matricule</span> et <span className="font-medium">date</span>, puis importe.
            Exemple: <span className="font-medium">VDM-002-2026-03.pdf</span> ou <span className="font-medium">03-2026_VDM-002.pdf</span>.
          </p>
        </div>

        <label className="text-sm text-vdm-gold-900 block">
          PDFs (multi-sélection)
          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={(e) => {
              const nextFiles = Array.from(e.target.files ?? []);
              if (nextFiles.length === 0) return;
              setMasterPdfs((prev) => {
                const seen = new Set(prev.map((f) => importFileKey(f)));
                const merged = [...prev];
                for (const f of nextFiles) {
                  const key = importFileKey(f);
                  if (seen.has(key)) continue;
                  seen.add(key);
                  merged.push(f);
                }
                return merged;
              });
              // reset input so selecting the same file again triggers onChange
              e.currentTarget.value = "";
            }}
            className="mt-1 block w-full rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-blue-700"
            disabled={masterIsSubmitting}
          />
        </label>

        <div className="text-xs text-vdm-gold-700">
          Sélectionnés: {masterPdfs.length} PDF(s)
          {masterPdfs.length ? ` — ${masterPdfs.slice(0, 3).map((f) => f.name).join(", ")}${masterPdfs.length > 3 ? "…" : ""}` : ""}
        </div>

        {masterPdfs.length ? (
          <div className="rounded-lg border border-vdm-gold-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-sm font-semibold text-vdm-gold-900">Fichiers sélectionnés</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => removeFilesByKeys(selectedImportFileKeys)}
                  disabled={selectedImportFileKeys.size === 0}
                  className="px-2.5 py-1 rounded-md border border-red-300 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  Retirer la sélection
                </button>
                <button
                  type="button"
                  onClick={clearImportList}
                  className="px-2.5 py-1 rounded-md border border-vdm-gold-300 text-xs text-vdm-gold-800 hover:bg-vdm-gold-50"
                >
                  Vider la liste
                </button>
              </div>
            </div>
            <div className="max-h-44 overflow-auto space-y-2">
              {masterPdfs.slice(0, 50).map((f) => (
                <div key={importFileKey(f)} className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedImportFileKeys.has(importFileKey(f))}
                      onChange={() => toggleImportFileSelected(importFileKey(f))}
                      className="shrink-0"
                    />
                    <div className="text-xs text-vdm-gold-800 truncate" title={f.name}>
                      {f.name}
                    </div>
                  </label>
                  <div className="shrink-0 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setImportPreviewFile(f)}
                      className="px-2 py-1 rounded-md border border-vdm-gold-300 text-xs text-vdm-gold-800 hover:bg-vdm-gold-50"
                    >
                      Aperçu
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFilesByKeys(new Set([importFileKey(f)]))}
                      className="px-2 py-1 rounded-md border border-red-300 text-xs text-red-700 hover:bg-red-50"
                    >
                      Retirer
                    </button>
                  </div>
                </div>
              ))}
              {masterPdfs.length > 50 ? (
                <div className="text-xs text-vdm-gold-700">+ {masterPdfs.length - 50} autres fichiers…</div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div>
          <button
            type="button"
            onClick={importMultiplePdfs}
            disabled={masterIsSubmitting || masterPdfs.length === 0}
            className="px-4 py-2 rounded-lg bg-vdm-gold-800 text-white hover:bg-vdm-gold-700 disabled:opacity-60"
          >
            {masterIsSubmitting ? "Import..." : "Importer et envoyer au PDG"}
          </button>
        </div>
      </section>

      {showIndividualImport ? (
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
      ) : null}

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

      {importPreviewFile && importPreviewUrl ? (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 md:p-8" onClick={() => setImportPreviewFile(null)}>
          <div
            className="mx-auto h-full w-full max-w-6xl rounded-xl bg-white shadow-xl flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-vdm-gold-100 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-vdm-gold-900">Aperçu du fichier sélectionné</h3>
                <p className="text-xs text-vdm-gold-700">{importPreviewFile.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setImportPreviewFile(null)}
                className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 hover:bg-vdm-gold-50"
              >
                Fermer
              </button>
            </div>
            <div className="p-4 h-full min-h-0">
              <iframe className="h-full w-full rounded-lg border border-vdm-gold-200 bg-white" src={importPreviewUrl} title="Aperçu fichier import" />
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
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openSlipPreview(slip.id)}
                            disabled={previewLoadingId === slip.id}
                            className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 hover:bg-vdm-gold-50 disabled:opacity-60"
                          >
                            {previewLoadingId === slip.id ? "Chargement..." : "Aperçu"}
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadSlip(slip.id)}
                            disabled={downloadingId === slip.id}
                            className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 hover:bg-vdm-gold-50 disabled:opacity-60"
                          >
                            {downloadingId === slip.id ? "Téléchargement..." : "Télécharger"}
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDeleteSlip(slip.id, String(slip.fileName ?? ""))}
                            disabled={deletingId === slip.id}
                            className="px-3 py-1.5 rounded-md border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            {deletingId === slip.id ? "Suppression..." : "Supprimer"}
                          </button>
                        </div>
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

      {previewSlipId && previewSlipUrl ? (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 md:p-8" onClick={() => setPreviewSlipId(null)}>
          <div
            className="mx-auto h-full w-full max-w-6xl rounded-xl bg-white shadow-xl flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-vdm-gold-100 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-vdm-gold-900">Aperçu du bulletin (en attente)</h3>
                <p className="text-xs text-vdm-gold-700">{previewSlipFileName}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => downloadSlip(previewSlipId)}
                  className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 hover:bg-vdm-gold-50"
                >
                  Télécharger
                </button>
                <button
                  type="button"
                  onClick={() => requestDeleteSlip(previewSlipId, previewSlipFileName)}
                  className="px-3 py-1.5 rounded-md border border-red-300 text-red-700 hover:bg-red-50"
                >
                  Supprimer
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewSlipId(null)}
                  className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 hover:bg-vdm-gold-50"
                >
                  Fermer
                </button>
              </div>
            </div>
            <div className="p-4 h-full min-h-0">
              <iframe className="h-full w-full rounded-lg border border-vdm-gold-200 bg-white" src={previewSlipUrl} title="Aperçu bulletin en attente" />
            </div>
          </div>
        </div>
      ) : null}

      {deleteModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setDeleteModal(null)}>
          <div
            className="w-full max-w-md rounded-[24px] bg-white shadow-[0_30px_60px_rgba(0,0,0,0.35)] overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-vdm-gold-100">
              <p className="text-lg font-semibold text-vdm-gold-900">Supprimer le bulletin ?</p>
              <p className="mt-1 text-sm text-vdm-gold-700">
                Ce bulletin est en attente de signature. Cette action est irréversible.
              </p>
              <p className="mt-2 text-xs text-gray-600 break-words">{deleteModal.fileName || "Bulletin"}</p>
            </div>
            <div className="px-5 py-4 flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteModal(null)}
                disabled={deletingId === deleteModal.id}
                className="flex-1 rounded-xl border border-vdm-gold-300 py-2 text-sm font-semibold text-vdm-gold-800 hover:bg-vdm-gold-50 disabled:opacity-60"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => confirmDeleteSlip(deleteModal.id)}
                disabled={deletingId === deleteModal.id}
                className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deletingId === deleteModal.id ? "Suppression..." : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
