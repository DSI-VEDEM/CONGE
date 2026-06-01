"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  firstDafDelegationRoute,
  getEmployee,
  getToken,
  hasAnyDafPermission,
  hasDafPermission,
  hasRequiredProfileData,
  isDafLeader,
  routeForRole,
} from "@/lib/auth-client";

function isAllowedDafDelegatePath(pathname: string, employee: ReturnType<typeof getEmployee>) {
  const permissions = employee?.dafPermissions ?? null;
  if (!permissions) return false;
  if (pathname === "/dashboard/accountant") return true;
  if (hasDafPermission(permissions, "holidays") && pathname.startsWith("/dashboard/accountant/holidays")) {
    return true;
  }
  if (
    hasDafPermission(permissions, "leaveBalance") &&
    pathname.startsWith("/dashboard/accountant/department/leave-adjustment")
  ) {
    return true;
  }
  if (
    hasDafPermission(permissions, "contractDocuments") &&
    (pathname.startsWith("/dashboard/accountant/administration/contracts/types") ||
      pathname.startsWith("/dashboard/accountant/administration/contracts/documents"))
  ) {
    return true;
  }
  if (
    hasDafPermission(permissions, "salarySlips") &&
    (pathname.startsWith("/dashboard/accountant/payslips/imported") ||
      pathname.startsWith("/dashboard/accountant/payslips/admin"))
  ) {
    return true;
  }
  return false;
}

export default function RequireAccountantOrDafDelegate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = getToken();
    const employee = getEmployee();

    if (!token || !employee) {
      router.replace("/login");
      return;
    }

    if (employee.status !== "ACTIVE") {
      router.replace("/login");
      return;
    }

    if (!hasRequiredProfileData(employee) && pathname !== "/onboarding") {
      router.replace("/onboarding");
      return;
    }

    if (isDafLeader(employee.role, employee.departmentType ?? null)) return;

    if (!hasAnyDafPermission(employee)) {
      router.replace(
        routeForRole(employee.role, employee.isDsiAdmin, employee.departmentType ?? null, employee.dafPermissions)
      );
      return;
    }

    if (!isAllowedDafDelegatePath(pathname, employee)) {
      router.replace(firstDafDelegationRoute(employee.dafPermissions));
      return;
    }

    if (pathname === "/dashboard/accountant") {
      router.replace(firstDafDelegationRoute(employee.dafPermissions));
    }
  }, [pathname, router]);

  return <>{children}</>;
}
