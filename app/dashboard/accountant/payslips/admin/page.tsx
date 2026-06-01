"use client";

import RequireAuth from "@/app/components/RequireAuth";
import RoleGate from "@/app/components/RoleGate";
import SalarySlipsAdmin from "@/app/components/SalarySlipsAdmin";

export default function AccountantPayslipsAdminPage() {
  return (
    <RequireAuth>
      <RoleGate allow={["ACCOUNTANT"]} allowDafPermissions={["salarySlips"]}>
        <SalarySlipsAdmin />
      </RoleGate>
    </RequireAuth>
  );
}
