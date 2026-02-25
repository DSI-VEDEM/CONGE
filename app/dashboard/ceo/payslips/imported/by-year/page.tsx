"use client";

import RequireAuth from "@/app/components/RequireAuth";
import RoleGate from "@/app/components/RoleGate";
import ImportedSalarySlipsByYear from "@/app/components/ImportedSalarySlipsByYear";

export default function CeoImportedPayslipsByYearPage() {
  return (
    <RequireAuth>
      <RoleGate allow={["CEO"]}>
        <div className="p-6">
          <ImportedSalarySlipsByYear />
        </div>
      </RoleGate>
    </RequireAuth>
  );
}
