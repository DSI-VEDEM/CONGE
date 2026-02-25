"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getEmployee, getToken } from "@/lib/auth-client";
import DashboardCharts from "@/app/components/DashboardCharts";

type LeaveItem = {
  id: string;
  startDate: string;
  endDate: string;
  status: "SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  createdAt: string;
};

type PendingEmployee = { id: string };

type PendingLeave = {
  id: string;
  createdAt: string;
};

const BASE_ALLOWANCE = 25;

const MONTHS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Août",
  "Sept",
  "Oct",
  "Nov",
  "Déc",
];

function toUtcDay(value: string | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function overlapDaysInYear(start: string, end: string, year: number) {
  const startUtc = toUtcDay(start);
  const endUtc = toUtcDay(end);
  if (startUtc == null || endUtc == null) return 0;
  if (endUtc < startUtc) return 0;

  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year, 11, 31);

  const s = Math.max(startUtc, yearStart);
  const e = Math.min(endUtc, yearEnd);
  if (s > e) return 0;

  return Math.floor((e - s) / 86400000) + 1;
}

function consumedDaysForYear(leaves: LeaveItem[], year: number) {
  let total = 0;
  for (const leave of leaves) {
    if (
      leave.status === "APPROVED" ||
      leave.status === "PENDING" ||
      leave.status === "SUBMITTED"
    ) {
      total += overlapDaysInYear(leave.startDate, leave.endDate, year);
    }
  }
  return total;
}

export default function DsiDashboard() {
  const employee = useMemo(() => getEmployee(), []);
  const [leaves, setLeaves] = useState<LeaveItem[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<PendingLeave[]>([]);
  const [pendingEmployees, setPendingEmployees] = useState<PendingEmployee[]>([]);
  const [annualBalance, setAnnualBalance] = useState<number>(BASE_ALLOWANCE);
  const [remainingBalance, setRemainingBalance] = useState<number>(BASE_ALLOWANCE);

  const refreshData = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    const [myRes, pendingRes, employeesRes] = await Promise.all([
      fetch("/api/leave-requests/my", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch("/api/leave-requests/pending", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch("/api/admin/employees/pending", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    const myData = await myRes.json().catch(() => ({}));
    if (myRes.ok) {
      const nextLeaves = myData?.leaves ?? [];
      setLeaves(nextLeaves);
      const base = Number(
        myData?.annualLeaveBalance ?? myData?.employee?.leaveBalance ?? BASE_ALLOWANCE
      );
      const normalizedBase = Number.isFinite(base) ? base : BASE_ALLOWANCE;
      setAnnualBalance(normalizedBase);
      const remainingFromApi = Number(myData?.remainingCurrentYear ?? NaN);
      const year = new Date().getFullYear();
      const fallbackRemaining = Math.max(0, normalizedBase - consumedDaysForYear(nextLeaves, year));
      setRemainingBalance(
        Number.isFinite(remainingFromApi) ? remainingFromApi : fallbackRemaining
      );
    }

    const pendingData = await pendingRes.json().catch(() => ({}));
    if (pendingRes.ok) setPendingLeaves(pendingData?.leaves ?? []);

    const employeesData = await employeesRes.json().catch(() => ({}));
    if (employeesRes.ok) setPendingEmployees(employeesData?.employees ?? []);
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

    let approvedDays = 0;
    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;

    const monthlyCounts = Array.from({ length: 12 }, () => 0);

    for (const leave of leaves) {
      if (leave.status === "PENDING" || leave.status === "SUBMITTED")
        pendingCount += 1;

      if (leave.status === "APPROVED") {
        approvedCount += 1;
        approvedDays += overlapDaysInYear(
          leave.startDate,
          leave.endDate,
          year
        );
      }

      if (leave.status === "REJECTED") rejectedCount += 1;

      const d = new Date(leave.createdAt);
      if (!Number.isNaN(d.getTime()) && d.getUTCFullYear() === year) {
        monthlyCounts[d.getUTCMonth()] += 1;
      }
    }

    const balance = Math.max(0, remainingBalance);

    return {
      balance,
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
        { name: "Boîte de réception", value: pendingLeaves.length },
        { name: "Comptes", value: pendingEmployees.length },
        { name: "Solde", value: balance },
      ],
    };
  }, [leaves, pendingLeaves.length, pendingEmployees.length, remainingBalance]);

  return (
    <div className="p-6 space-y-4">
      <div>
        <div className="text-xl font-semibold text-vdm-gold-800">
          Bonjour {employee?.firstName ?? ""} {employee?.lastName ?? ""}
        </div>
        <div className="text-sm text-vdm-gold-700">
          Vous êtes connecté en tant que DSI (Administrateur).
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="bg-white border border-vdm-gold-200 rounded-xl p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-vdm-gold-700">
              Solde de congés
            </div>
            <button
              type="button"
              onClick={refreshData}
              className="px-2 py-1 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
            >
              Rafraîchir
            </button>
          </div>
          <div className="text-3xl font-bold text-vdm-gold-800 mt-2">
            {stats.balance} jours
          </div>
          <div className="text-xs text-gray-500 mt-2">
          Base annuelle : {annualBalance} jours.
          </div>
        </div>

        <div className="bg-white border border-vdm-gold-200 rounded-xl p-4">
          <div className="text-sm text-vdm-gold-700">À traiter</div>
          <div className="text-3xl font-bold text-vdm-gold-800 mt-2">
            {pendingLeaves.length}
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Demandes transmises par la comptable.
          </div>
        </div>

        <div className="bg-white border border-vdm-gold-200 rounded-xl p-4">
          <div className="text-sm text-vdm-gold-700">
            Comptes en attente
          </div>
          <div className="text-3xl font-bold text-vdm-gold-800 mt-2">
            {pendingEmployees.length}
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Validation des nouveaux employés.
          </div>
        </div>
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
