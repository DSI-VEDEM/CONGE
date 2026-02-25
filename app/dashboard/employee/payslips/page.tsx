"use client";

import RequireAuth from "@/app/components/RequireAuth";
import RoleGate from "@/app/components/RoleGate";
import MySalarySlips from "@/app/components/MySalarySlips";

export default function EmployeePayslipsPage() {
  return (
    <RequireAuth>
      <RoleGate allow={["EMPLOYEE", "SERVICE_HEAD"]}>
        <MySalarySlips />
      </RoleGate>
    </RequireAuth>
  );
}
