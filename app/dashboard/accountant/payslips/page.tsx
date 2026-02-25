"use client";

import RequireAuth from "@/app/components/RequireAuth";
import RoleGate from "@/app/components/RoleGate";
import MySalarySlips from "@/app/components/MySalarySlips";

export default function AccountantPayslipsPage() {
  return (
    <RequireAuth>
      <RoleGate allow={["ACCOUNTANT"]}>
        <MySalarySlips />
      </RoleGate>
    </RequireAuth>
  );
}
