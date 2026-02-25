"use client";

import RequireAuth from "@/app/components/RequireAuth";
import RoleGate from "@/app/components/RoleGate";
import MySalarySlips from "@/app/components/MySalarySlips";

export default function ManagerPayslipsPage() {
  return (
    <RequireAuth>
      <RoleGate allow={["SERVICE_HEAD"]}>
        <MySalarySlips />
      </RoleGate>
    </RequireAuth>
  );
}
