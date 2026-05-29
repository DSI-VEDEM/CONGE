"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  type DafDelegationPermission,
  EmployeeRole,
  getEmployee,
  hasDafPermission,
  isDafLeader,
  routeForRole,
} from "@/lib/auth-client";

export default function RoleGate({
  allow,
  allowDafPermissions = [],
  children,
}: {
  allow: EmployeeRole[];
  allowDafPermissions?: DafDelegationPermission[];
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    const employee = getEmployee();
    if (!employee) return;

    const hasDelegatedAccess = allowDafPermissions.some((permission) => hasDafPermission(employee, permission));
    const hasDafDirectorAccess =
      allow.includes("ACCOUNTANT") && isDafLeader(employee.role, employee.departmentType ?? null);
    if (!allow.includes(employee.role) && !hasDafDirectorAccess && !hasDelegatedAccess) {
      router.replace(
        routeForRole(employee.role, employee.isDsiAdmin, employee.departmentType ?? null, employee.dafPermissions)
      );
    }
  }, [allow, allowDafPermissions, router]);

  return <>{children}</>;
}
