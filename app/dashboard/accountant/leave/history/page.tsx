"use client";

import LeaveHistoryTables from "@/app/dashboard/leave/LeaveHistoryTables";

export default function AccountantLeaveHistory() {
  return (
    <LeaveHistoryTables
      title="Demandes en cours"
      subtitle="Suivez l'état de vos demandes."
      historyTitle="Historique"
      historySubtitle="Toutes vos demandes clôturées."
      activeRoutes={["/api/leave-requests/my"]}
      historyRoutes={["/api/leave-requests/history?mine=1"]}
    />
  );
}
