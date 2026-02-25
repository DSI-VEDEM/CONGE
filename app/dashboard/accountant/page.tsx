"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardCharts from "@/app/components/DashboardCharts";
import { getToken } from "@/lib/auth-client";

const MONTHS = [
  "Jan.",
  "Fév.",
  "Mar.",
  "Avr.",
  "Mai",
  "Juin",
  "Juil.",
  "Août",
  "Sept.",
  "Oct.",
  "Nov.",
  "Déc.",
];

type PendingLeave = {
  id: string;
  createdAt: string;
};

type DecisionItem = {
  id: string;
  type: "APPROVE" | "REJECT" | "ESCALATE" | "CANCEL";
  createdAt: string;
};

function toMonthIndex(value: string | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCMonth();
}

export default function AccountantHome() {
  const [pending, setPending] = useState<PendingLeave[]>([]);
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshData = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setIsLoading(true);
    try {
      const [pendingRes, historyRes] = await Promise.all([
        fetch("/api/leave-requests/pending", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/leave-requests/history?scope=actor", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const pendingData = await pendingRes.json().catch(() => ({}));
      if (pendingRes.ok) {
        setPending((pendingData?.leaves ?? []).map((l: any) => ({ id: l.id, createdAt: l.createdAt })));
      }

      const historyData = await historyRes.json().catch(() => ({}));
      if (historyRes.ok) {
        setDecisions(
          (historyData?.decisions ?? []).map((d: any) => ({
            id: d.id,
            type: d.type,
            createdAt: d.createdAt,
          }))
        );
      }
    } finally {
      setIsLoading(false);
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
    const now = new Date();
    const year = now.getUTCFullYear();

    let approved = 0;
    let rejected = 0;
    let escalated = 0;
    let decisionsThisMonth = 0;

    const monthlyCounts = Array.from({ length: 12 }, () => 0);

    for (const decision of decisions) {
      if (decision.type === "APPROVE") approved += 1;
      if (decision.type === "REJECT") rejected += 1;
      if (decision.type === "ESCALATE") escalated += 1;

      const d = new Date(decision.createdAt);
      if (!Number.isNaN(d.getTime())) {
        if (d.getUTCFullYear() === year) {
          monthlyCounts[d.getUTCMonth()] += 1;
        }
        if (d.getUTCFullYear() === year && d.getUTCMonth() === now.getUTCMonth()) {
          decisionsThisMonth += 1;
        }
      }
    }

    return {
      pendingCount: pending.length,
      escalatedCount: escalated,
      decisionsThisMonth,
      lineData: MONTHS.map((name, idx) => ({ name, value: monthlyCounts[idx] })),
      pieData: [
        { name: "Validées", value: approved },
        { name: "Refusées", value: rejected },
        { name: "Transmises", value: escalated },
      ],
      barData: [
        { name: "Demandes", value: pending.length + decisions.length },
        { name: "Transmises", value: escalated },
        { name: "Décisions", value: approved + rejected },
      ],
    };
  }, [decisions, pending.length]);

  return (
    <div className="p-6">
      <div className="text-xl font-semibold text-vdm-gold-800">Tableau de bord Comptable</div>
      <div className="text-sm text-vdm-gold-700 mt-1">Gestion des demandes de congé.</div>

      <div className="grid gap-4 mt-6 md:grid-cols-3">
        <div className="bg-white border border-vdm-gold-200 rounded-xl p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm text-vdm-gold-700">Demandes reçues</div>
            <button
              type="button"
              onClick={refreshData}
              className="px-2 py-1 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
            >
              Rafraîchir
            </button>
          </div>
          <div className="text-3xl font-bold text-vdm-gold-800 mt-2">{stats.pendingCount}</div>
          <div className="text-xs text-gray-500 mt-2">Toutes les demandes à traiter.</div>
        </div>

        <div className="bg-white border border-vdm-gold-200 rounded-xl p-4">
          <div className="text-sm text-vdm-gold-700">Transmises au PDG</div>
          <div className="text-3xl font-bold text-vdm-gold-800 mt-2">{stats.escalatedCount}</div>
          <div className="text-xs text-gray-500 mt-2">Demandes issues des responsables.</div>
        </div>

        <div className="bg-white border border-vdm-gold-200 rounded-xl p-4">
          <div className="text-sm text-vdm-gold-700">Décisions prises</div>
          <div className="text-3xl font-bold text-vdm-gold-800 mt-2">{stats.decisionsThisMonth}</div>
          <div className="text-xs text-gray-500 mt-2">Validations/refus ce mois-ci.</div>
        </div>
      </div>

      <DashboardCharts
        title="Vue Comptable"
        subtitle={isLoading ? "Mise à jour des données..." : "Demandes reçues et décisions."}
        lineData={stats.lineData}
        pieData={stats.pieData}
        barData={stats.barData}
      />
    </div>
  );
}
