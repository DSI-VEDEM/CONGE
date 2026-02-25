"use client";
import { formatDateDMY } from "@/lib/date-format";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "@/app/components/DataTable";
import EmployeeAvatar from "@/app/components/EmployeeAvatar";
import { getToken } from "@/lib/auth-client";
import toast from "react-hot-toast";

type Req = {
  id: string;
  firstName: string;
  lastName: string;
  employeeName: string;
  profilePhotoUrl?: string | null;
  department?: string;
  period: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  note?: string;
  origin: "EMPLOYEE" | "DEPT_HEAD" | "SERVICE_HEAD" | "OTHER";
};

type HistoryItem = {
  id: string;
  firstName: string;
  lastName: string;
  employeeName: string;
  profilePhotoUrl?: string | null;
  period: string;
  decision: "APPROVED" | "REJECTED" | "ESCALATED" | "CANCELLED";
  decidedAt: string;
  target?: string;
  days: number;
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

function decisionLabel(decision: HistoryItem["decision"]) {
  if (decision === "APPROVED") return "Validée";
  if (decision === "REJECTED") return "Refusée";
  if (decision === "CANCELLED") return "Annulée";
  return "Transmise";
}

function decisionClass(decision: HistoryItem["decision"]) {
  if (decision === "APPROVED") return "text-emerald-700";
  if (decision === "REJECTED") return "text-red-600";
  if (decision === "CANCELLED") return "text-gray-500";
  return "text-amber-700";
}

function originLabel(origin: Req["origin"]) {
  if (origin === "DEPT_HEAD") return "Directeur des opérations";
  if (origin === "SERVICE_HEAD") return "Directeur adjoint";
  if (origin === "EMPLOYEE") return "Employé";
  return "Autre";
}

function toUtcDay(value: string | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function daysBetweenInclusive(start: string, end: string) {
  const s = toUtcDay(start);
  const e = toUtcDay(end);
  if (s == null || e == null) return 0;
  if (e < s) return 0;
  return Math.floor((e - s) / 86400000) + 1;
}

export default function AccountantInbox() {
  const PENDING_PAGE_SIZE = 100;
  const HISTORY_PAGE_SIZE = 100;
  const [rows, setRows] = useState<Req[]>([]);
  const [historyRows, setHistoryRows] = useState<HistoryItem[]>([]);
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingHasNext, setPendingHasNext] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasNext, setHistoryHasNext] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const pendingPageCacheRef = useRef<Record<number, { rows: Req[]; hasNext: boolean }>>({});
  const historyPageCacheRef = useRef<Record<number, { rows: HistoryItem[]; hasNext: boolean }>>({});

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
              department: x.employee?.department?.type ?? x.employee?.department?.name ?? "",
              period: `${formatDateDMY(x.startDate)} - ${formatDateDMY(x.endDate)}`,
              status: x.status,
              note: x.reason ?? "",
              origin:
                x.employee?.role === "DEPT_HEAD"
                  ? "DEPT_HEAD"
                  : x.employee?.role === "SERVICE_HEAD"
                  ? "SERVICE_HEAD"
                  : "EMPLOYEE",
            }));
          const entry = { rows: mapped, hasNext: mapped.length === PENDING_PAGE_SIZE };
          pendingPageCacheRef.current[targetPage] = entry;
          if (options.applyResult && !cancelled) {
            setRows(entry.rows);
            setPendingHasNext(entry.hasNext);
          }
        }
      } finally {
        if (options.showLoader && !cancelled) setIsLoading(false);
      }
    };

    const load = async () => {
      const cached = pendingPageCacheRef.current[pendingPage];
      if (cached) {
        setRows(cached.rows);
        setPendingHasNext(cached.hasNext);
      } else {
        await fetchPendingPage(pendingPage, { applyResult: true, showLoader: true });
      }

      const current = pendingPageCacheRef.current[pendingPage];
      const nextPage = pendingPage + 1;
      if (current?.hasNext && !pendingPageCacheRef.current[nextPage]) {
        void fetchPendingPage(nextPage, { applyResult: false, showLoader: false });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [pendingPage]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let cancelled = false;

    const fetchHistoryPage = async (targetPage: number, options: { applyResult: boolean; showLoader: boolean }) => {
      if (options.showLoader && !cancelled) setIsHistoryLoading(true);
      try {
        const res = await fetch(`/api/leave-requests/history?scope=actor&page=${targetPage}&take=${HISTORY_PAGE_SIZE}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const mapped = (data?.decisions ?? []).map((d: any) => {
              const startRaw = d.leaveRequest?.startDate ?? "";
              const endRaw = d.leaveRequest?.endDate ?? "";
              const start = formatDateDMY(startRaw);
              const end = formatDateDMY(endRaw);
              return {
                id: d.id,
                firstName: d.leaveRequest?.employee?.firstName ?? "",
                lastName: d.leaveRequest?.employee?.lastName ?? "",
                employeeName: `${d.leaveRequest?.employee?.firstName ?? ""} ${d.leaveRequest?.employee?.lastName ?? ""}`.trim(),
                profilePhotoUrl: d.leaveRequest?.employee?.profilePhotoUrl ?? null,
                period: `${start} - ${end}`,
                decision:
                  d.type === "APPROVE"
                    ? "APPROVED"
                    : d.type === "REJECT"
                    ? "REJECTED"
                    : d.type === "ESCALATE"
                    ? "ESCALATED"
                    : "CANCELLED",
                decidedAt: formatDateDMY(d.createdAt),
                target: d.toEmployee?.role ?? "-",
                days: startRaw && endRaw ? daysBetweenInclusive(startRaw, endRaw) : 0,
              };
            });
          const entry = { rows: mapped, hasNext: mapped.length === HISTORY_PAGE_SIZE };
          historyPageCacheRef.current[targetPage] = entry;
          if (options.applyResult && !cancelled) {
            setHistoryRows(entry.rows);
            setHistoryHasNext(entry.hasNext);
          }
        }
      } finally {
        if (options.showLoader && !cancelled) setIsHistoryLoading(false);
      }
    };

    const loadHistory = async () => {
      const cached = historyPageCacheRef.current[historyPage];
      if (cached) {
        setHistoryRows(cached.rows);
        setHistoryHasNext(cached.hasNext);
      } else {
        await fetchHistoryPage(historyPage, { applyResult: true, showLoader: true });
      }

      const current = historyPageCacheRef.current[historyPage];
      const nextPage = historyPage + 1;
      if (current?.hasNext && !historyPageCacheRef.current[nextPage]) {
        void fetchHistoryPage(nextPage, { applyResult: false, showLoader: false });
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [historyPage]);

  const departments = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.department).filter((dept): dept is string => !!dept))).sort(),
    [rows]
  );

  const filteredRows = useMemo(
    () => (departmentFilter ? rows.filter((row) => row.department === departmentFilter) : rows),
    [departmentFilter, rows]
  );

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

  const forwardToDeptHead = async (id: string) => {
    const token = getToken();
    if (!token) return;
    const t = toast.loading("Transmission au directeur de département...");
    try {
      const res = await fetch(`/api/leave-requests/${id}/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ toRole: "DEPT_HEAD" }),
      });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        toast.success("Demande transmise au directeur de département.", { id: t });
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

  const historyColumns = useMemo<ColumnDef<HistoryItem>[]>(
    () => [
      {
        id: "historyEmployee",
        header: "Employé",
        accessorKey: "employeeName",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <EmployeeAvatar
              firstName={row.original.firstName}
              lastName={row.original.lastName}
              profilePhotoUrl={row.original.profilePhotoUrl}
            />
            <div className="font-semibold">{row.original.employeeName}</div>
          </div>
        ),
      },
      { header: "Période", accessorKey: "period" },
      { header: "Jours", accessorKey: "days" },
      {
        header: "Décision",
        accessorKey: "decision",
        cell: ({ row }) => (
          <span className={`text-xs font-semibold ${decisionClass(row.original.decision)}`}>
            {decisionLabel(row.original.decision)}
          </span>
        ),
      },
      { header: "Cible", accessorKey: "target", cell: ({ row }) => row.original.target ?? "-" },
      { header: "Date", accessorKey: "decidedAt" },
    ],
    []
  );

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
      { header: "Département", accessorKey: "department", enableSorting: true },
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
        header: "Origine",
        accessorKey: "origin",
        cell: ({ row }) => originLabel(row.original.origin),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const isDirector = row.original.origin === "DEPT_HEAD" || row.original.origin === "SERVICE_HEAD";
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
              {isDirector ? (
                <button
                  onClick={() => forwardToCeo(row.original.id)}
                  className="px-2 py-1 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
                >
                  Transmettre au PDG
                </button>
              ) : (
                <>
                  <button
                    onClick={() => forwardToDeptHead(row.original.id)}
                    className="px-2 py-1 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
                  >
                    Transmettre au directeur de département
                  </button>
                  <button
                    onClick={() => forwardToCeo(row.original.id)}
                    className="px-2 py-1 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
                  >
                    Transmettre au PDG
                  </button>
                </>
              )}
            </div>
          );
        },
      },
    ],
    [approve, reject, forwardToDeptHead, forwardToCeo]
  );

  return (
    <div className="p-6">
      <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Boîte de réception des demandes</div>
      <div className="text-sm text-vdm-gold-700 mb-4">
        La comptable peut transmettre les demandes au directeur de département ou directement au PDG. Les demandes des responsables sont transmises au PDG.
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-vdm-gold-700">Filtrer par département</div>
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="w-full sm:max-w-xs rounded-md border border-vdm-gold-200 bg-white px-3 py-2 text-sm text-vdm-gold-900 focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
        >
          <option value="">Tous les départements</option>
          {departments.map((dept) => (
            <option key={dept} value={dept}>
              {dept}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        data={filteredRows}
        columns={columns}
        searchPlaceholder="Rechercher une demande..."
        onRefresh={() => window.location.reload()}
      />
      <div className="mt-3 flex items-center justify-between">
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
      {isLoading ? <div className="mt-3 text-xs text-vdm-gold-700">Chargement des demandes...</div> : null}

      <div className="mt-8">
        <div className="text-lg font-semibold mb-1 text-vdm-gold-800">Historique des décisions</div>
        <div className="text-sm text-vdm-gold-700 mb-4">Traçabilité des validations et transmissions.</div>
        <DataTable
          data={historyRows}
          columns={historyColumns}
          searchPlaceholder="Rechercher une décision..."
          onRefresh={() => window.location.reload()}
        />
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-vdm-gold-700">Page {historyPage}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
              disabled={historyPage <= 1 || isHistoryLoading}
              className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50 disabled:opacity-60"
            >
              Précédent
            </button>
            <button
              type="button"
              onClick={() => setHistoryPage((p) => p + 1)}
              disabled={!historyHasNext || isHistoryLoading}
              className="px-3 py-1.5 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50 disabled:opacity-60"
            >
              Suivant
            </button>
          </div>
        </div>
        {isHistoryLoading ? <div className="mt-3 text-xs text-vdm-gold-700">Chargement de l’historique...</div> : null}
      </div>
    </div>
  );
}
