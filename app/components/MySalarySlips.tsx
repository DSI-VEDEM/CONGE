"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getToken } from "@/lib/auth-client";

type Slip = {
  id: string;
  year: number;
  month: number;
  fileName: string;
  signedAt?: string | null;
  signedBy?: {
    firstName: string;
    lastName: string;
    role: string;
  } | null;
  createdAt: string;
};

const MONTH_LABELS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

function toPeriod(year: number, month: number) {
  const label = MONTH_LABELS[month - 1] ?? String(month);
  return `${label} ${year}`;
}

function formatDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MySalarySlips() {
  const [slips, setSlips] = useState<Slip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewSlip, setPreviewSlip] = useState<{ id: string; fileName: string; fileDataUrl: string } | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/salary-slips?mine=1&signed=1", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(String(data?.error ?? "Erreur de chargement"));
        return;
      }

      setSlips(Array.isArray(data?.slips) ? data.slips : []);
    } catch {
      setError("Erreur réseau");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hasSlips = useMemo(() => slips.length > 0, [slips.length]);
  const slipsByYear = useMemo(() => {
    const sorted = [...slips].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      if (a.month !== b.month) return b.month - a.month;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });

    const grouped = new Map<number, Slip[]>();
    for (const slip of sorted) {
      const current = grouped.get(slip.year) ?? [];
      current.push(slip);
      grouped.set(slip.year, current);
    }
    return Array.from(grouped.entries()).map(([year, yearSlips]) => ({ year, slips: yearSlips }));
  }, [slips]);

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

  const openPreview = useCallback(async (id: string) => {
    const token = getToken();
    if (!token) return;

    setPreviewLoadingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/salary-slips/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(data?.error ?? "Impossible d'ouvrir l'aperçu"));
        return;
      }
      const slip = data?.slip;
      if (!slip?.fileDataUrl || !slip?.fileName) {
        setError("Fichier indisponible");
        return;
      }
      setPreviewSlip({
        id: String(slip.id),
        fileName: String(slip.fileName),
        fileDataUrl: String(slip.fileDataUrl),
      });
    } catch {
      setError("Erreur réseau");
    } finally {
      setPreviewLoadingId(null);
    }
  }, []);

  return (
    <div className="p-12 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-vdm-gold-900">Bulletins de salaire</h1>
          <p className="text-sm text-vdm-gold-700">Retrouvez les bulletins signés par le PDG.</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="px-3 py-2 rounded-lg border border-vdm-gold-300 text-sm text-vdm-gold-800 hover:bg-vdm-gold-50"
        >
          Rafraîchir
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-vdm-gold-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-4 text-sm text-gray-600">Chargement...</div>
        ) : !hasSlips ? (
          <div className="p-4 text-sm text-gray-600">Aucun bulletin disponible pour le moment.</div>
        ) : (
          <div className="divide-y divide-vdm-gold-100">
            {slipsByYear.map((group, index) => (
              <details key={group.year} open={index === 0} className="group">
                <summary className="list-none flex items-center justify-between gap-3 px-4 py-3 bg-vdm-gold-50 text-vdm-gold-900 font-semibold cursor-pointer">
                  <span>Année {group.year}</span>
                  <span className="text-xs font-medium text-vdm-gold-700">
                    {group.slips.length} bulletin(s) de salaire
                  </span>
                </summary>

                <div className="p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.slips.map((slip) => (
                    <div key={slip.id} className="rounded-lg border border-vdm-gold-200 bg-white p-3 space-y-2">
                      <div className="text-sm font-semibold text-vdm-gold-900 uppercase">
                        {MONTH_LABELS[slip.month - 1] ?? toPeriod(slip.year, slip.month)}
                      </div>
                      <div className="text-xs text-gray-600 truncate" title={slip.fileName}>
                        {slip.fileName}
                      </div>
                      <div className="text-xs text-gray-600">
                        Signé par{" "}
                        {slip.signedBy ? `${slip.signedBy.firstName} ${slip.signedBy.lastName}` : "le PDG"}
                      </div>
                      <div className="text-xs text-gray-600">
                        {formatDateTime(String(slip.signedAt ?? slip.createdAt))}
                      </div>
                      <div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openPreview(slip.id)}
                            disabled={previewLoadingId === slip.id}
                            className="flex-1 px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 hover:bg-vdm-gold-50 disabled:opacity-60"
                          >
                            {previewLoadingId === slip.id ? "Chargement..." : "Aperçu"}
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadSlip(slip.id)}
                            disabled={downloadingId === slip.id}
                            className="flex-1 px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 hover:bg-vdm-gold-50 disabled:opacity-60"
                          >
                            {downloadingId === slip.id ? "Téléchargement..." : "Télécharger"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      {previewSlip ? (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 md:p-8" onClick={() => setPreviewSlip(null)}>
          <div
            className="mx-auto h-full w-full max-w-6xl rounded-xl bg-white shadow-xl flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-vdm-gold-100 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-vdm-gold-900">Aperçu du bulletin</h3>
                <p className="text-xs text-vdm-gold-700">{previewSlip.fileName}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => downloadSlip(previewSlip.id)}
                  className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 hover:bg-vdm-gold-50"
                >
                  Télécharger
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewSlip(null)}
                  className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 hover:bg-vdm-gold-50"
                >
                  Fermer
                </button>
              </div>
            </div>
            <div className="p-4 h-full min-h-0">
              <iframe className="h-full w-full rounded-lg border border-vdm-gold-200 bg-white" src={previewSlip.fileDataUrl} title="Aperçu bulletin" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
