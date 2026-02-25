"use client";

import { type ChangeEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getToken } from "@/lib/auth-client";

type Slip = {
  id: string;
  year: number;
  month: number;
  fileName: string;
  createdAt: string;
  signedAt?: string | null;
  signedBy?: {
    firstName: string;
    lastName: string;
    role: string;
  } | null;
  employee?: {
    firstName: string;
    lastName: string;
    matricule?: string | null;
    email: string;
  };
};

type SlipPreview = {
  id: string;
  fileName: string;
  fileDataUrl: string;
};

type SignaturePlacement = {
  x: number;
  yTop: number;
};

type MonthGroup = {
  month: number;
  slips: Slip[];
};

type YearGroup = {
  year: number;
  months: MonthGroup[];
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

const DEFAULT_SIGNATURE_PLACEMENT: SignaturePlacement = {
  x: 0.6,
  yTop: 0.84,
};

function toPeriod(year: number, month: number) {
  const label = MONTH_LABELS[month - 1] ?? String(month);
  return `${label} ${year}`;
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("fr-FR");
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

function groupSlipsByYearMonth(slips: Slip[]): YearGroup[] {
  const years = new Map<number, Map<number, Slip[]>>();
  for (const slip of slips) {
    const months = years.get(slip.year) ?? new Map<number, Slip[]>();
    const monthSlips = months.get(slip.month) ?? [];
    monthSlips.push(slip);
    months.set(slip.month, monthSlips);
    years.set(slip.year, months);
  }

  return Array.from(years.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => ({
      year,
      months: Array.from(months.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([month, monthSlips]) => ({ month, slips: monthSlips })),
    }));
}

export default function CeoSalarySlipSigning() {
  const PAGE_SIZE = 120;
  const [pendingSlips, setPendingSlips] = useState<Slip[]>([]);
  const [signedSlips, setSignedSlips] = useState<Slip[]>([]);
  const [pendingPage, setPendingPage] = useState(1);
  const [signedPage, setSignedPage] = useState(1);
  const [pendingHasNext, setPendingHasNext] = useState(false);
  const [signedHasNext, setSignedHasNext] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [signatureImageDataUrl, setSignatureImageDataUrl] = useState<string | null>(null);
  const [savingSignature, setSavingSignature] = useState(false);
  const [historyYearFilter, setHistoryYearFilter] = useState("ALL");
  const [previewSlip, setPreviewSlip] = useState<SlipPreview | null>(null);
  const [signedPreviewSlip, setSignedPreviewSlip] = useState<SlipPreview | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [signaturePlacement, setSignaturePlacement] = useState<SignaturePlacement>(DEFAULT_SIGNATURE_PLACEMENT);
  const [hasCustomPlacement, setHasCustomPlacement] = useState(false);
  const [isDraggingSignature, setIsDraggingSignature] = useState(false);

  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const signatureBoxRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);

  const fileToDataUrl = useCallback((file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Impossible de lire l'image"));
      reader.readAsDataURL(file);
    });
  }, []);

  const refreshSignature = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const res = await fetch("/api/ceo/signature", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setSignatureImageDataUrl(data?.signatureImageDataUrl ?? null);
  }, []);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const [pendingRes, signedRes] = await Promise.all([
        fetch(`/api/salary-slips?unsigned=1&page=${pendingPage}&take=${PAGE_SIZE}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/salary-slips?signed=1&page=${signedPage}&take=${PAGE_SIZE}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const pendingData = await pendingRes.json().catch(() => ({}));
      const signedData = await signedRes.json().catch(() => ({}));

      if (!pendingRes.ok) {
        setError(String(pendingData?.error ?? "Erreur de chargement"));
        return;
      }
      if (!signedRes.ok) {
        setError(String(signedData?.error ?? "Erreur de chargement"));
        return;
      }

      const nextPending = Array.isArray(pendingData?.slips) ? pendingData.slips : [];
      const nextSigned = Array.isArray(signedData?.slips) ? signedData.slips : [];
      setPendingSlips(nextPending);
      setSignedSlips(nextSigned);
      setPendingHasNext(nextPending.length === PAGE_SIZE);
      setSignedHasNext(nextSigned.length === PAGE_SIZE);
    } catch {
      setError("Erreur réseau");
    } finally {
      setIsLoading(false);
    }
  }, [pendingPage, signedPage]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!active) return;
      await refresh();
    };

    load();
    const intervalId = window.setInterval(load, 30000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    const onFocus = () => load();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    refreshSignature();
  }, [refreshSignature]);

  const sortedSignedSlips = useMemo(
    () =>
      [...signedSlips].sort((a, b) => {
        const tA = new Date(String(a.signedAt ?? a.createdAt)).getTime();
        const tB = new Date(String(b.signedAt ?? b.createdAt)).getTime();
        if (!Number.isNaN(tA) && !Number.isNaN(tB)) return tB - tA;
        return String(b.signedAt ?? b.createdAt).localeCompare(String(a.signedAt ?? a.createdAt));
      }),
    [signedSlips]
  );

  const sortedPendingSlips = useMemo(
    () =>
      [...pendingSlips].sort((a, b) => {
        const tA = new Date(a.createdAt).getTime();
        const tB = new Date(b.createdAt).getTime();
        if (!Number.isNaN(tA) && !Number.isNaN(tB)) return tB - tA;
        return String(b.createdAt).localeCompare(String(a.createdAt));
      }),
    [pendingSlips]
  );

  const pendingSlipsByYear = useMemo(() => {
    return groupSlipsByYearMonth(sortedPendingSlips);
  }, [sortedPendingSlips]);

  const signedHistoryYears = useMemo(
    () => Array.from(new Set(sortedSignedSlips.map((s) => String(s.year)))).sort((a, b) => Number(b) - Number(a)),
    [sortedSignedSlips]
  );

  const signedSlipsByYear = useMemo(() => {
    return groupSlipsByYearMonth(sortedSignedSlips);
  }, [sortedSignedSlips]);

  const filteredSignedSlipsByYear = useMemo(() => {
    if (historyYearFilter === "ALL") return signedSlipsByYear;
    const y = Number(historyYearFilter);
    if (!Number.isInteger(y)) return signedSlipsByYear;
    return signedSlipsByYear.filter((group) => group.year === y);
  }, [historyYearFilter, signedSlipsByYear]);

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

  const loadSlipPreview = useCallback(async (id: string, onErrorMessage: string) => {
    const token = getToken();
    if (!token) return null;

    const res = await fetch(`/api/salary-slips/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(String(data?.error ?? onErrorMessage));
      return null;
    }

    const slip = data?.slip;
    if (!slip?.fileDataUrl || !slip?.fileName) {
      setError("Fichier indisponible");
      return null;
    }

    return {
      id: String(slip.id),
      fileName: String(slip.fileName),
      fileDataUrl: String(slip.fileDataUrl),
    } satisfies SlipPreview;
  }, []);

  const signSlip = useCallback(
    async (id: string, force = false) => {
      const token = getToken();
      if (!token) return false;

      setSigningId(id);
      setError(null);
      setSuccess(null);

      try {
        const payload = hasCustomPlacement
          ? {
              placementX: signaturePlacement.x,
              placementYTop: signaturePlacement.yTop,
            }
          : undefined;

        const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
        if (payload) headers["Content-Type"] = "application/json";

        const res = await fetch(`/api/salary-slips/${id}/sign${force ? "?force=1" : ""}`, {
          method: "POST",
          headers,
          body: payload ? JSON.stringify(payload) : undefined,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(String(data?.error ?? "Signature impossible"));
          return false;
        }

        setSuccess(force ? "Bulletin re-signé et PDF régénéré" : "Bulletin signé");
        const signedPreview = await loadSlipPreview(id, "Impossible d'ouvrir l'aperçu après signature");
        if (signedPreview) {
          setSignedPreviewSlip(signedPreview);
        }
        await refresh();
        return true;
      } catch {
        setError("Erreur réseau");
        return false;
      } finally {
        setSigningId(null);
      }
    },
    [hasCustomPlacement, loadSlipPreview, refresh, signaturePlacement.x, signaturePlacement.yTop]
  );

  const openSlipPreview = useCallback(async (id: string) => {
    setPreviewLoadingId(id);
    setError(null);

    try {
      const slipPreview = await loadSlipPreview(id, "Impossible d'ouvrir l'aperçu");
      if (slipPreview) {
        setPreviewSlip(slipPreview);
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setPreviewLoadingId(null);
    }
  }, [loadSlipPreview]);

  const openSignedSlipPreview = useCallback(async (id: string) => {
    setPreviewLoadingId(id);
    setError(null);

    try {
      const slipPreview = await loadSlipPreview(id, "Impossible d'ouvrir l'aperçu du bulletin signé");
      if (slipPreview) {
        setSignedPreviewSlip(slipPreview);
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setPreviewLoadingId(null);
    }
  }, [loadSlipPreview]);

  const updatePlacementFromClient = useCallback((clientX: number, clientY: number) => {
    const frame = previewFrameRef.current;
    if (!frame) return;

    const frameRect = frame.getBoundingClientRect();
    const signatureBox = signatureBoxRef.current;
    const sigWidthRatio = signatureBox ? signatureBox.offsetWidth / frameRect.width : 0;
    const sigHeightRatio = signatureBox ? signatureBox.offsetHeight / frameRect.height : 0;
    const dragOffset = dragOffsetRef.current;

    const offsetX = dragOffset ? dragOffset.x / frameRect.width : sigWidthRatio / 2;
    const offsetY = dragOffset ? dragOffset.y / frameRect.height : sigHeightRatio / 2;

    const xRatio = (clientX - frameRect.left) / frameRect.width - offsetX;
    const yTopRatio = (clientY - frameRect.top) / frameRect.height - offsetY;

    setSignaturePlacement({
      x: clamp(xRatio, 0, Math.max(0, 1 - sigWidthRatio)),
      yTop: clamp(yTopRatio, 0, Math.max(0, 1 - sigHeightRatio)),
    });
    setHasCustomPlacement(true);
  }, []);

  const onSignaturePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const frame = previewFrameRef.current;
    const signatureBox = signatureBoxRef.current;
    if (!frame || !signatureBox) return;

    event.preventDefault();
    const signatureRect = signatureBox.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - signatureRect.left,
      y: event.clientY - signatureRect.top,
    };

    setIsDraggingSignature(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPreviewPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDraggingSignature) return;
      updatePlacementFromClient(event.clientX, event.clientY);
    },
    [isDraggingSignature, updatePlacementFromClient]
  );

  const stopDraggingSignature = useCallback(() => {
    setIsDraggingSignature(false);
    dragOffsetRef.current = null;
  }, []);

  const onSignatureFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        setError("La signature doit être une image");
        return;
      }

      const token = getToken();
      if (!token) return;

      setSavingSignature(true);
      setError(null);
      setSuccess(null);

      try {
        const dataUrl = await fileToDataUrl(file);
        const res = await fetch("/api/ceo/signature", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ signatureImageDataUrl: dataUrl }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(String(data?.error ?? "Impossible d'enregistrer la signature"));
          return;
        }
        setSignatureImageDataUrl(dataUrl);
        setSuccess("Signature image mise à jour");
      } catch {
        setError("Erreur réseau");
      } finally {
        setSavingSignature(false);
        event.target.value = "";
      }
    },
    [fileToDataUrl]
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-vdm-gold-900">Signature des bulletins</h1>
          <p className="text-sm text-vdm-gold-700">Le PDG signe les bulletins importés par la comptable.</p>
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
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{success}</div>
      )}

      <section className="rounded-xl border border-vdm-gold-200 bg-white p-4 space-y-3">
        <div className="text-sm font-semibold text-vdm-gold-900">Ma signature (image remplaçable)</div>
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={onSignatureFileChange}
          disabled={savingSignature}
          className="block w-full rounded-lg border border-vdm-gold-300 bg-vdm-gold-50 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-vdm-gold-800 file:px-3 file:py-1.5 file:text-white"
        />
        <div className="text-xs text-vdm-gold-700">
          {savingSignature
            ? "Enregistrement de la signature..."
            : signatureImageDataUrl
              ? "Signature actuelle enregistrée. Utilisez l'aperçu pour la positionner par drag and drop avant signature."
              : "Aucune signature configurée pour le moment."}
        </div>
        {signatureImageDataUrl && (
          <div className="rounded-md border border-vdm-gold-200 bg-white p-2 inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={signatureImageDataUrl} alt="Signature PDG" className="max-h-20 object-contain" />
          </div>
        )}
      </section>

      <div className="rounded-xl border border-vdm-gold-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-vdm-gold-100">
          <h2 className="text-base font-semibold text-vdm-gold-900">Bulletins en attente de signature</h2>
        </div>

        {isLoading ? (
          <div className="p-4 text-sm text-gray-600">Chargement...</div>
        ) : pendingSlipsByYear.length === 0 ? (
          <div className="p-4 text-sm text-gray-600">Aucun bulletin en attente de signature.</div>
        ) : (
          <div className="divide-y divide-vdm-gold-100">
            {pendingSlipsByYear.map((group, index) => (
              <details key={group.year} open={index === 0}>
                <summary className="list-none px-4 py-3 bg-vdm-gold-50 text-vdm-gold-900 font-semibold flex items-center justify-between">
                  <span>Année {group.year}</span>
                  <span className="text-xs text-vdm-gold-700">
                    {group.months.reduce((total, month) => total + month.slips.length, 0)} bulletin(s)
                  </span>
                </summary>

                <div className="divide-y divide-vdm-gold-100">
                  {group.months.map((monthGroup, monthIndex) => (
                    <details key={`${group.year}-${monthGroup.month}`} open={monthIndex === 0}>
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
                              <th className="px-4 py-3 text-left font-semibold">Date d'import</th>
                              <th className="px-4 py-3 text-right font-semibold">Actions</th>
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
                                <td className="px-4 py-3">{formatDate(slip.createdAt)}</td>
                                <td className="px-4 py-3 text-right space-x-2">
                                  <button
                                    type="button"
                                    onClick={() => downloadSlip(slip.id)}
                                    disabled={
                                      downloadingId === slip.id || signingId === slip.id || previewLoadingId === slip.id
                                    }
                                    className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 hover:bg-vdm-gold-50 disabled:opacity-60"
                                  >
                                    {downloadingId === slip.id ? "Téléchargement..." : "Télécharger"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openSlipPreview(slip.id)}
                                    disabled={
                                      previewLoadingId === slip.id || signingId === slip.id || downloadingId === slip.id
                                    }
                                    className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 hover:bg-vdm-gold-50 disabled:opacity-60"
                                  >
                                    {previewLoadingId === slip.id ? "Ouverture..." : "Aperçu"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void signSlip(slip.id);
                                    }}
                                    disabled={
                                      signingId === slip.id ||
                                      downloadingId === slip.id ||
                                      previewLoadingId === slip.id ||
                                      !signatureImageDataUrl
                                    }
                                    className="px-3 py-1.5 rounded-md bg-vdm-gold-800 text-white hover:bg-vdm-gold-700 disabled:opacity-60"
                                  >
                                    {signingId === slip.id ? "Signature..." : "Signer"}
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
        <div className="px-4 py-3 border-t border-vdm-gold-100 flex items-center justify-between">
          <div className="text-xs text-vdm-gold-700">Page {pendingPage}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
              disabled={pendingPage <= 1 || isLoading}
              className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50 disabled:opacity-60"
            >
              Précédent
            </button>
            <button
              type="button"
              onClick={() => setPendingPage((p) => p + 1)}
              disabled={!pendingHasNext || isLoading}
              className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50 disabled:opacity-60"
            >
              Suivant
            </button>
          </div>
        </div>
      </div>

      {previewSlip && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 md:p-8" onClick={() => setPreviewSlip(null)}>
          <div
            className="mx-auto h-full w-full max-w-6xl rounded-xl bg-white shadow-xl flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-vdm-gold-100 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-vdm-gold-900">Aperçu et placement de la signature</h3>
                <p className="text-xs text-vdm-gold-700">{previewSlip.fileName}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewSlip(null)}
                className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 hover:bg-vdm-gold-50"
              >
                Fermer
              </button>
            </div>

            <div className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 h-full min-h-0">
              <div
                ref={previewFrameRef}
                className="relative min-h-[420px] lg:min-h-0 h-[70vh] lg:h-full rounded-lg border border-vdm-gold-200 overflow-hidden bg-white select-none"
                onPointerMove={onPreviewPointerMove}
                onPointerUp={stopDraggingSignature}
                onPointerCancel={stopDraggingSignature}
                onPointerLeave={stopDraggingSignature}
              >
                <iframe className="h-full w-full" src={previewSlip.fileDataUrl} title="Aperçu bulletin" />

                {signatureImageDataUrl && (
                  <div
                    ref={signatureBoxRef}
                    className={`absolute rounded-md border border-vdm-gold-400 bg-white/90 p-1 shadow ${
                      isDraggingSignature ? "cursor-grabbing" : "cursor-grab"
                    }`}
                    style={{
                      left: `${signaturePlacement.x * 100}%`,
                      top: `${signaturePlacement.yTop * 100}%`,
                      touchAction: "none",
                    }}
                    onPointerDown={onSignaturePointerDown}
                    onPointerUp={stopDraggingSignature}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={signatureImageDataUrl} alt="Signature PDG" className="w-44 max-h-24 object-contain" />
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-vdm-gold-200 bg-vdm-gold-50/30 p-3 space-y-3">
                <p className="text-sm text-vdm-gold-900">Glissez la signature sur l'aperçu puis signez.</p>
                <p className="text-xs text-vdm-gold-700">
                  La position est appliquée au PDF final au moment de la signature et réutilisée pour les signatures suivantes.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setSignaturePlacement(DEFAULT_SIGNATURE_PLACEMENT);
                    setHasCustomPlacement(false);
                  }}
                  className="w-full px-3 py-2 rounded-md border border-vdm-gold-300 text-vdm-gold-800 hover:bg-vdm-gold-50"
                >
                  Réinitialiser la position
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const ok = await signSlip(previewSlip.id);
                    if (ok) setPreviewSlip(null);
                  }}
                  disabled={signingId === previewSlip.id || !signatureImageDataUrl}
                  className="w-full px-3 py-2 rounded-md bg-vdm-gold-800 text-white hover:bg-vdm-gold-700 disabled:opacity-60"
                >
                  {signingId === previewSlip.id ? "Signature..." : "Signer ce bulletin"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {signedPreviewSlip && (
        <div className="fixed inset-0 z-[60] bg-black/70 p-4 md:p-8" onClick={() => setSignedPreviewSlip(null)}>
          <div
            className="mx-auto h-full w-full max-w-6xl rounded-xl bg-white shadow-xl flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-vdm-gold-100 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-vdm-gold-900">Aperçu global après signature</h3>
                <p className="text-xs text-vdm-gold-700">{signedPreviewSlip.fileName}</p>
              </div>
              <button
                type="button"
                onClick={() => setSignedPreviewSlip(null)}
                className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 hover:bg-vdm-gold-50"
              >
                Fermer
              </button>
            </div>
            <div className="p-4 h-full min-h-0">
              <iframe
                className="h-full w-full rounded-lg border border-vdm-gold-200 bg-white"
                src={signedPreviewSlip.fileDataUrl}
                title="Aperçu global du bulletin signé"
              />
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-vdm-gold-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-vdm-gold-100">
          <h2 className="text-base font-semibold text-vdm-gold-900">Bulletins signés par année</h2>
        </div>

        <div className="px-4 py-3 border-b border-vdm-gold-100 bg-vdm-gold-50/30">
          <label className="text-sm text-vdm-gold-900">
            Filtrer par année
            <select
              value={historyYearFilter}
              onChange={(e) => setHistoryYearFilter(e.target.value)}
              className="mt-1 w-full sm:w-64 rounded-lg border border-vdm-gold-300 px-3 py-2 bg-white"
            >
              <option value="ALL">Toutes</option>
              {signedHistoryYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isLoading ? (
          <div className="p-4 text-sm text-gray-600">Chargement...</div>
        ) : filteredSignedSlipsByYear.length === 0 ? (
          <div className="p-4 text-sm text-gray-600">Aucun bulletin signé pour le moment.</div>
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
                              <th className="px-4 py-3 text-left font-semibold">Signé le (date/heure)</th>
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
                                <td className="px-4 py-3">{formatDateTime(String(slip.signedAt ?? slip.createdAt))}</td>
                                <td className="px-4 py-3 text-right space-x-2">
                                  <button
                                    type="button"
                                    onClick={() => downloadSlip(slip.id)}
                                    disabled={downloadingId === slip.id || signingId === slip.id}
                                    className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 hover:bg-vdm-gold-50 disabled:opacity-60"
                                  >
                                    {downloadingId === slip.id ? "Téléchargement..." : "Télécharger"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void openSignedSlipPreview(slip.id);
                                    }}
                                    disabled={previewLoadingId === slip.id || signingId === slip.id || downloadingId === slip.id}
                                    className="px-3 py-1.5 rounded-md bg-vdm-gold-800 text-white hover:bg-vdm-gold-700 disabled:opacity-60"
                                  >
                                    {previewLoadingId === slip.id ? "Ouverture..." : "Aperçu"}
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
        <div className="px-4 py-3 border-t border-vdm-gold-100 flex items-center justify-between">
          <div className="text-xs text-vdm-gold-700">Page {signedPage}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSignedPage((p) => Math.max(1, p - 1))}
              disabled={signedPage <= 1 || isLoading}
              className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50 disabled:opacity-60"
            >
              Précédent
            </button>
            <button
              type="button"
              onClick={() => setSignedPage((p) => p + 1)}
              disabled={!signedHasNext || isLoading}
              className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50 disabled:opacity-60"
            >
              Suivant
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
