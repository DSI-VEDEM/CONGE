"use client";

import RequireAuth from "@/app/components/RequireAuth";
import RoleGate from "@/app/components/RoleGate";
import CeoSalarySlipSigning from "@/app/components/CeoSalarySlipSigning";

export default function CeoPayslipsPage() {
  return (
    <RequireAuth>
      <RoleGate allow={["CEO"]}>
        <CeoSalarySlipSigning />
      </RoleGate>
    </RequireAuth>
  );
}
