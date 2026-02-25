"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { EmployeeRole, getEmployee, routeForRole } from "@/lib/auth-client";

export default function RoleGate({
  allow,
  children,
}: {
  allow: EmployeeRole[];
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    const employee = getEmployee();
    if (!employee) return;

    if (!allow.includes(employee.role)) {
      router.replace(routeForRole(employee.role, employee.isDsiAdmin, employee.departmentType ?? null));
    }
  }, [allow, router]);

  return <>{children}</>;
}
