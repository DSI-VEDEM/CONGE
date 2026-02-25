"use client";

import RequireAuth from "@/app/components/RequireAuth";
import RoleGate from "@/app/components/RoleGate";
import ImportedSalarySlipsByYear from "@/app/components/ImportedSalarySlipsByYear";

export default function AccountantImportedPayslipsByYearPage() {
  return (
    <RequireAuth>
      <RoleGate allow={["ACCOUNTANT"]}>
        <div className="p-6">
          <ImportedSalarySlipsByYear />
        </div>
      </RoleGate>
    </RequireAuth>
  );
}
