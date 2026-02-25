"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { EmployeeSession, getEmployee, getToken, routeForRole } from "@/lib/auth-client";

type ManagerSession = EmployeeSession & {
  departmentType?: "DAF" | "DSI" | "OPERATIONS" | "OTHERS" | string | null;
};

export default function RequireManagerDeptHead({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    const emp = getEmployee() as ManagerSession | null;

    if (!token || !emp) {
      router.replace("/login");
      return;
    }

    if (emp.status !== "ACTIVE") {
      router.replace("/login");
      return;
    }

    if (emp.role !== "SERVICE_HEAD") {
      router.replace(routeForRole(emp.role, emp.isDsiAdmin, emp.departmentType ?? null));
      return;
    }

    router.replace(routeForRole(emp.role, emp.isDsiAdmin, emp.departmentType ?? null));
    return;
  }, [router]);

  return <>{children}</>;
}
