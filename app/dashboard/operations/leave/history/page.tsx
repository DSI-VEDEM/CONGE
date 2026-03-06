"use client";

import LeaveHistoryTables from "@/app/dashboard/leave/LeaveHistoryTables";

export default function OperationsLeaveHistory() {
  return (
    <LeaveHistoryTables
      title="Mes demandes"
      subtitle="Suivez l'état de vos demandes en cours de traitement."
      historyTitle="Historique"
      historySubtitle="Historique complet de mes demandes."
      activeRoutes={["/api/leave-requests/my", "/api/leaves"]}
      historyRoutes={["/api/leave-requests/history?mine=1", "/api/leaves/history?mine=1"]}
    />
  );
}
