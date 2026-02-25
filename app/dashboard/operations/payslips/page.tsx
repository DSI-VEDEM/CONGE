"use client";

import RequireAuth from "@/app/components/RequireAuth";
import RoleGate from "@/app/components/RoleGate";
import MySalarySlips from "@/app/components/MySalarySlips";

export default function OperationsPayslipsPage() {
  return (
    <RequireAuth>
      <RoleGate allow={["DEPT_HEAD"]}>
        <MySalarySlips />
      </RoleGate>
    </RequireAuth>
  );
}
