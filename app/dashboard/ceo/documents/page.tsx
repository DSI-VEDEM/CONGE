"use client";

import { useMemo } from "react";
import EmployeeDocumentsSection from "@/app/components/EmployeeDocumentsSection";
import { getEmployee } from "@/lib/auth-client";

export default function CeoDocumentsPage() {
  const employee = useMemo(() => getEmployee(), []);

  return (
    <div className="p-6">
      <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Documents RH</div>
      <div className="text-sm text-vdm-gold-700 mb-4">
        Liste des documents RH des employés (consultation et téléchargement).
      </div>
      {employee ? (
        <EmployeeDocumentsSection employee={employee} scope="employees" filtersInlineOnLarge />
      ) : (
        <div className="bg-white border border-vdm-gold-200 rounded-xl p-4 text-sm text-vdm-gold-700">
          Aucune session trouvée.
        </div>
      )}
    </div>
  );
}
