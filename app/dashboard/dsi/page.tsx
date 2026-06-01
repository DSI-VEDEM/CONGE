"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getEmployee, getToken } from "@/lib/auth-client";
import DashboardCharts from "@/app/components/DashboardCharts";
import { isPaidLeaveType } from "@/lib/leave-types";
import { countLeaveDaysOverlapInYear } from "@/lib/leave-days";

type LeaveItem = {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  status: "SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  createdAt: string;
};

type PendingEmployee = { id: string };

type DepartmentEmployee = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
  role?: string | null;
  status?: string | null;
};

type PendingLeave = {
  id: string;
  createdAt: string;
  employee?: {
    id?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    jobTitle?: string | null;
    role?: string | null;
  } | null;
};

type DecisionItem = {
  id: string;
  type: "APPROVE" | "REJECT" | "ESCALATE" | "CANCEL";
  createdAt: string;
  comment?: string | null;
};

const BASE_ALLOWANCE = 25;

const MONTHS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];

function consumedDaysForYear(leaves: LeaveItem[], year: number) {
  let total = 0;
  for (const leave of leaves) {
    if (leave.status === "APPROVED" || leave.status === "PENDING" || leave.status === "SUBMITTED") {
      if (!isPaidLeaveType(leave.type)) continue;
      total += countLeaveDaysOverlapInYear({
        start: leave.startDate,
        end: leave.endDate,
        year,
        type: leave.type,
      });
    }
  }
  return total;
}

function fullName(person?: { firstName?: string | null; lastName?: string | null } | null) {
  return `${person?.firstName ?? ""} ${person?.lastName ?? ""}`.trim() || "Collaborateur";
}

export default function DsiDashboard() {
  const employee = useMemo(() => getEmployee(), []);
  const [leaves, setLeaves] = useState<LeaveItem[]>([]);
  const [dsiPendingLeaves, setDsiPendingLeaves] = useState<PendingLeave[]>([]);
  const [operationsPendingLeaves, setOperationsPendingLeaves] = useState<PendingLeave[]>([]);
  const [dsiEmployees, setDsiEmployees] = useState<DepartmentEmployee[]>([]);
  const [operationsEmployees, setOperationsEmployees] = useState<DepartmentEmployee[]>([]);
  const [pendingEmployees, setPendingEmployees] = useState<PendingEmployee[]>([]);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [annualBalance, setAnnualBalance] = useState<number>(BASE_ALLOWANCE);
  const [remainingBalance, setRemainingBalance] = useState<number>(BASE_ALLOWANCE);

  const refreshData = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    const [
      myRes,
      dsiPendingRes,
      operationsPendingRes,
      dsiEmployeesRes,
      operationsEmployeesRes,
      employeesRes,
      historyRes,
    ] = await Promise.all([
      fetch("/api/leave-requests/my", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch("/api/leave-requests/pending?scope=dsi&take=300", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch("/api/leave-requests/pending?scope=operations&take=300", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch("/api/departments/dsi/employees", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch("/api/departments/operations/employees?maxEmployees=120", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch("/api/admin/employees/pending", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch("/api/leave-requests/history?scope=actor", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    const myData = await myRes.json().catch(() => ({}));
    if (myRes.ok) {
      const nextLeaves = myData?.leaves ?? [];
      setLeaves(nextLeaves);
      const base = Number(myData?.annualLeaveBalance ?? myData?.employee?.leaveBalance ?? BASE_ALLOWANCE);
      const normalizedBase = Number.isFinite(base) ? base : BASE_ALLOWANCE;
      setAnnualBalance(normalizedBase);
      const remainingFromApi = Number(myData?.remainingCurrentYear ?? NaN);
      const year = new Date().getFullYear();
      const fallbackRemaining = normalizedBase - consumedDaysForYear(nextLeaves, year);
      setRemainingBalance(Number.isFinite(remainingFromApi) ? remainingFromApi : fallbackRemaining);
    }

    const dsiPendingData = await dsiPendingRes.json().catch(() => ({}));
    if (dsiPendingRes.ok) setDsiPendingLeaves(dsiPendingData?.leaves ?? []);

    const operationsPendingData = await operationsPendingRes.json().catch(() => ({}));
    if (operationsPendingRes.ok) setOperationsPendingLeaves(operationsPendingData?.leaves ?? []);

    const dsiEmployeesData = await dsiEmployeesRes.json().catch(() => ({}));
    if (dsiEmployeesRes.ok) setDsiEmployees(dsiEmployeesData?.employees ?? []);

    const operationsEmployeesData = await operationsEmployeesRes.json().catch(() => ({}));
    if (operationsEmployeesRes.ok) setOperationsEmployees(operationsEmployeesData?.employees ?? []);

    const employeesData = await employeesRes.json().catch(() => ({}));
    if (employeesRes.ok) setPendingEmployees(employeesData?.employees ?? []);

    const historyData = await historyRes.json().catch(() => ({}));
    if (historyRes.ok) {
      setDecisions(
        (historyData?.decisions ?? []).map((decision: any) => ({
          id: decision.id,
          type: decision.type,
          createdAt: decision.createdAt,
          comment: decision.comment ?? null,
        }))
      );
    }
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!active) return;
      await refreshData();
    };

    load();
    const intervalId = setInterval(load, 30000);

    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };

    const onUpdated = () => load();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("leave-requests-updated", onUpdated);

    return () => {
      active = false;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("leave-requests-updated", onUpdated);
    };
  }, [refreshData]);

  const stats = useMemo(() => {
    const year = new Date().getFullYear();

    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let autoApprovedCount = 0;

    const monthlyCounts = Array.from({ length: 12 }, () => 0);

    for (const leave of leaves) {
      if (leave.status === "PENDING" || leave.status === "SUBMITTED") pendingCount += 1;

      if (leave.status === "APPROVED") {
        approvedCount += 1;
      }

      if (leave.status === "REJECTED") rejectedCount += 1;

      const d = new Date(leave.createdAt);
      if (!Number.isNaN(d.getTime()) && d.getUTCFullYear() === year) {
        monthlyCounts[d.getUTCMonth()] += 1;
      }
    }

    for (const decision of decisions) {
      const comment = (decision.comment ?? "").toLowerCase();
      if (decision.type === "APPROVE" && comment.includes("auto-approval")) {
        autoApprovedCount += 1;
      }
    }

    const balance = remainingBalance;

    return {
      balance,
      autoApprovedCount,
      lineData: MONTHS.map((name, idx) => ({
        name,
        value: monthlyCounts[idx],
      })),
      pieData: [
        { name: "En attente", value: pendingCount },
        { name: "Approuvées", value: approvedCount },
        { name: "Refusées", value: rejectedCount },
      ],
      barData: [
        { name: "Demandes DSI", value: dsiPendingLeaves.length },
        { name: "Demandes DO", value: operationsPendingLeaves.length },
        { name: "Employés DSI", value: dsiEmployees.length },
        { name: "Employés DO", value: operationsEmployees.length },
        { name: "Auto-validées", value: autoApprovedCount },
        { name: "Comptes", value: pendingEmployees.length },
        { name: "Solde", value: balance },
      ],
    };
  }, [
    decisions,
    leaves,
    dsiEmployees.length,
    dsiPendingLeaves.length,
    operationsEmployees.length,
    operationsPendingLeaves.length,
    pendingEmployees.length,
    remainingBalance,
  ]);

  return (
    <div className="p-6 space-y-4">
      <div>
        <div className="text-xl font-semibold text-vdm-gold-800">
          Bonjour {employee?.firstName ?? ""} {employee?.lastName ?? ""}
        </div>
        <div className="text-sm text-vdm-gold-700">Vous êtes connecté en tant que DSI (Administrateur).</div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="bg-white border border-vdm-gold-200 rounded-xl p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-vdm-gold-700">Solde de congés</div>
            <button
              type="button"
              onClick={refreshData}
              className="px-2 py-1 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
            >
              Rafraîchir
            </button>
          </div>
          <div className="text-3xl font-bold text-vdm-gold-800 mt-2">{stats.balance} jours</div>
          <div className="text-xs text-gray-500 mt-2">Base annuelle : {annualBalance} jours.</div>
        </div>

        <div className="bg-white border border-vdm-gold-200 rounded-xl p-4">
          <div className="text-sm text-vdm-gold-700">Demandes DSI</div>
          <div className="text-3xl font-bold text-vdm-gold-800 mt-2">{dsiPendingLeaves.length}</div>
          <div className="text-xs text-gray-500 mt-2">Boîte réservée au département DSI.</div>
        </div>

        <div className="bg-white border border-vdm-gold-200 rounded-xl p-4">
          <div className="text-sm text-vdm-gold-700">Demandes DO visibles</div>
          <div className="text-3xl font-bold text-vdm-gold-800 mt-2">
            {operationsPendingLeaves.length}
          </div>
          <div className="text-xs text-gray-500 mt-2">Boîte réservée à la Direction des opérations.</div>
        </div>

        <div className="bg-white border border-vdm-gold-200 rounded-xl p-4">
          <div className="text-sm text-vdm-gold-700">Auto-validées</div>
          <div className="text-3xl font-bold text-vdm-gold-800 mt-2">{stats.autoApprovedCount}</div>
          <div className="text-xs text-gray-500 mt-2">Demandes validées automatiquement.</div>
        </div>

        <div className="bg-white border border-vdm-gold-200 rounded-xl p-4">
          <div className="text-sm text-vdm-gold-700">Comptes en attente</div>
          <div className="text-3xl font-bold text-vdm-gold-800 mt-2">{pendingEmployees.length}</div>
          <div className="text-xs text-gray-500 mt-2">Validation des nouveaux employés.</div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="bg-white border border-vdm-gold-200 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3 border-b border-vdm-gold-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-vdm-gold-900">Espace réservé DSI</h2>
              <p className="text-xs text-vdm-gold-700">Collaborateurs et demandes du département DSI.</p>
            </div>
            <div className="text-right text-xs text-vdm-gold-700">
              <div>{dsiEmployees.length} employé(s)</div>
              <div>{dsiPendingLeaves.length} demande(s)</div>
            </div>
          </div>

          <div className="grid gap-4 pt-4 md:grid-cols-2">
            <div>
              <div className="text-sm font-semibold text-vdm-gold-900 mb-2">Employés DSI</div>
              <div className="divide-y divide-vdm-gold-100">
                {dsiEmployees.slice(0, 5).map((item) => (
                  <div key={item.id} className="py-2">
                    <div className="text-sm font-medium text-vdm-gold-900">{fullName(item)}</div>
                    <div className="text-xs text-vdm-gold-600">{item.jobTitle || item.role || "—"}</div>
                  </div>
                ))}
                {dsiEmployees.length === 0 ? (
                  <div className="py-2 text-sm text-vdm-gold-700">Aucun employé DSI à afficher.</div>
                ) : null}
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-vdm-gold-900 mb-2">Demandes DSI</div>
              <div className="divide-y divide-vdm-gold-100">
                {dsiPendingLeaves.slice(0, 5).map((leave) => (
                  <div key={leave.id} className="py-2">
                    <div className="text-sm font-medium text-vdm-gold-900">{fullName(leave.employee)}</div>
                    <div className="text-xs text-vdm-gold-600">
                      Reçue le {new Date(leave.createdAt).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                ))}
                {dsiPendingLeaves.length === 0 ? (
                  <div className="py-2 text-sm text-vdm-gold-700">Aucune demande DSI en attente.</div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white border border-vdm-gold-200 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3 border-b border-vdm-gold-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-vdm-gold-900">
                Espace réservé Direction des opérations
              </h2>
              <p className="text-xs text-vdm-gold-700">Collaborateurs DO et demandes visibles par la DSI.</p>
            </div>
            <div className="text-right text-xs text-vdm-gold-700">
              <div>{operationsEmployees.length} employé(s)</div>
              <div>{operationsPendingLeaves.length} demande(s)</div>
            </div>
          </div>

          <div className="grid gap-4 pt-4 md:grid-cols-2">
            <div>
              <div className="text-sm font-semibold text-vdm-gold-900 mb-2">Employés DO</div>
              <div className="divide-y divide-vdm-gold-100">
                {operationsEmployees.slice(0, 5).map((item) => (
                  <div key={item.id} className="py-2">
                    <div className="text-sm font-medium text-vdm-gold-900">{fullName(item)}</div>
                    <div className="text-xs text-vdm-gold-600">{item.jobTitle || item.role || "—"}</div>
                  </div>
                ))}
                {operationsEmployees.length === 0 ? (
                  <div className="py-2 text-sm text-vdm-gold-700">Aucun employé DO à afficher.</div>
                ) : null}
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold text-vdm-gold-900 mb-2">Demandes DO visibles</div>
              <div className="divide-y divide-vdm-gold-100">
                {operationsPendingLeaves.slice(0, 5).map((leave) => (
                  <div key={leave.id} className="py-2">
                    <div className="text-sm font-medium text-vdm-gold-900">{fullName(leave.employee)}</div>
                    <div className="text-xs text-vdm-gold-600">
                      Reçue le {new Date(leave.createdAt).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                ))}
                {operationsPendingLeaves.length === 0 ? (
                  <div className="py-2 text-sm text-vdm-gold-700">Aucune demande DO en attente.</div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>

      <DashboardCharts
        title="Indicateurs DSI"
        subtitle="Synthèse des demandes et des comptes."
        lineData={stats.lineData}
        pieData={stats.pieData}
        barData={stats.barData}
      />
    </div>
  );
}
