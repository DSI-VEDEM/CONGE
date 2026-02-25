"use client";
import { formatDateDMY } from "@/lib/date-format";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/app/components/DataTable";
import EmployeeAvatar from "@/app/components/EmployeeAvatar";
import { getEmployee, getToken } from "@/lib/auth-client";
import toast from "react-hot-toast";

type Req = {
  id: string;
  firstName: string;
  lastName: string;
  employeeName: string;
  profilePhotoUrl?: string | null;
  period: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  note?: string;
};

function statusLabel(status: Req["status"]) {
  if (status === "APPROVED") return "Validée";
  if (status === "REJECTED") return "Refusée";
  return "En attente";
}

function statusClass(status: Req["status"]) {
  if (status === "APPROVED") return "text-emerald-700";
  if (status === "REJECTED") return "text-red-600";
  return "text-amber-700";
}

export default function OperationsInbox() {
  const PENDING_PAGE_SIZE = 100;
  const currentEmployee = useMemo(() => getEmployee(), []);
  const [rows, setRows] = useState<Req[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const pendingPageCacheRef = useRef<Record<number, { rows: Req[]; hasNext: boolean }>>({});

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let cancelled = false;

    const fetchPendingPage = async (targetPage: number, options: { applyResult: boolean; showLoader: boolean }) => {
      if (options.showLoader && !cancelled) setIsLoading(true);
      try {
        const res = await fetch(`/api/leave-requests/pending?page=${targetPage}&take=${PENDING_PAGE_SIZE}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const mapped = (data?.leaves ?? []).map((x: any) => ({
              id: x.id,
              firstName: x.employee?.firstName ?? "",
              lastName: x.employee?.lastName ?? "",
              employeeName: `${x.employee?.firstName ?? ""} ${x.employee?.lastName ?? ""}`.trim(),
              profilePhotoUrl: x.employee?.profilePhotoUrl ?? null,
              period: `${formatDateDMY(x.startDate)} - ${formatDateDMY(x.endDate)}`,
              status: x.status,
              note: x.reason ?? "",
            }));
          const entry = { rows: mapped, hasNext: mapped.length === PENDING_PAGE_SIZE };
          pendingPageCacheRef.current[targetPage] = entry;
          if (options.applyResult && !cancelled) {
            setRows(entry.rows);
            setHasNext(entry.hasNext);
          }
        }
      } finally {
        if (options.showLoader && !cancelled) setIsLoading(false);
      }
    };

    const load = async () => {
      const cached = pendingPageCacheRef.current[page];
      if (cached) {
        setRows(cached.rows);
        setHasNext(cached.hasNext);
      } else {
        await fetchPendingPage(page, { applyResult: true, showLoader: true });
      }

      const current = pendingPageCacheRef.current[page];
      const nextPage = page + 1;
      if (current?.hasNext && !pendingPageCacheRef.current[nextPage]) {
        void fetchPendingPage(nextPage, { applyResult: false, showLoader: false });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [page]);

  const approve = async (id: string) => {
    const token = getToken();
    if (!token) return;
    const t = toast.loading("Validation en cours...");
    try {
      const res = await fetch(`/api/leave-requests/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        toast.success("Congé validé.", { id: t });
      } else {
        toast.error("Erreur lors de la validation.", { id: t });
      }
    } catch {
      toast.error("Erreur réseau lors de la validation.", { id: t });
    }
  };

  const reject = async (id: string) => {
    const token = getToken();
    if (!token) return;
    const t = toast.loading("Refus en cours...");
    try {
      const res = await fetch(`/api/leave-requests/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        toast.success("Congé refusé.", { id: t });
      } else {
        toast.error("Erreur lors du refus.", { id: t });
      }
    } catch {
      toast.error("Erreur réseau lors du refus.", { id: t });
    }
  };

  const forwardToServiceHead = async (id: string) => {
    const token = getToken();
    if (!token) return;
    const t = toast.loading("Transmission au Directeur Adjoint...");
    try {
      const res = await fetch(`/api/leave-requests/${id}/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ toRole: "SERVICE_HEAD" }),
      });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        toast.success("Demande transmise au Directeur Adjoint.", { id: t });
      } else {
        toast.error("Erreur lors de la transmission.", { id: t });
      }
    } catch {
      toast.error("Erreur réseau lors de la transmission.", { id: t });
    }
  };

  const forwardToCeo = async (id: string) => {
    const token = getToken();
    if (!token) return;
    const t = toast.loading("Transmission au PDG...");
    try {
      const res = await fetch(`/api/leave-requests/${id}/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ toRole: "CEO" }),
      });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        toast.success("Demande transmise au PDG.", { id: t });
      } else {
        toast.error("Erreur lors de la transmission.", { id: t });
      }
    } catch {
      toast.error("Erreur réseau lors de la transmission.", { id: t });
    }
  };

  const columns = useMemo<ColumnDef<Req>[]>(
    () => [
      {
        header: "Employé",
        accessorKey: "employeeName",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <EmployeeAvatar
              firstName={row.original.firstName}
              lastName={row.original.lastName}
              profilePhotoUrl={row.original.profilePhotoUrl}
            />
            <div>
              <div className="font-semibold">{row.original.employeeName}</div>
              <div className="text-xs text-vdm-gold-700">{row.original.note ?? ""}</div>
            </div>
          </div>
        ),
      },
      { header: "Période", accessorKey: "period" },
      {
        header: "Statut",
        accessorKey: "status",
        cell: ({ row }) => (
          <span className={`text-xs font-semibold ${statusClass(row.original.status)}`}>
            {statusLabel(row.original.status)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const isDeptHead = currentEmployee?.role === "DEPT_HEAD";
          return (
            <div className="flex flex-wrap gap-2">
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
              {isDeptHead ? (
                <button
                  onClick={() => forwardToServiceHead(row.original.id)}
                  className="px-2 py-1 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
                >
                  Transmettre au Directeur Adjoint
                </button>
              ) : null}
              <button
                onClick={() => forwardToCeo(row.original.id)}
                className="px-2 py-1 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
              >
                Transmettre au PDG
              </button>
            </div>
          );
        },
      },
    ],
    [approve, reject, forwardToServiceHead, forwardToCeo, currentEmployee?.role]
  );

  return (
    <div className="p-6">
      <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Demandes transmises</div>
      <div className="text-sm text-vdm-gold-700 mb-4">
        {currentEmployee?.role === "SERVICE_HEAD"
          ? "Demandes provenant du Directeur des opérations pour décision."
          : "Demandes provenant de la comptable pour décision."}
      </div>

      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Rechercher une demande..."
        onRefresh={() => window.location.reload()}
      />
      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-vdm-gold-700">Page {page}</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isLoading}
            className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50 disabled:opacity-60"
          >
            Précédent
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNext || isLoading}
            className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50 disabled:opacity-60"
          >
            Suivant
          </button>
        </div>
      </div>
      {isLoading ? (
        <div className="mt-3 text-xs text-vdm-gold-700">Chargement des demandes...</div>
      ) : null}
    </div>
  );
}
