"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  EmployeeRole,
  getEmployee,
  getToken,
  hasRequiredProfileData,
  routeForRole,
} from "@/lib/auth-client";

export default function RequireRole({
  allow,
  children,
}: {
  allow: EmployeeRole[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = getToken();
    const emp = getEmployee();

    if (!token || !emp) {
      router.replace("/login");
      return;
    }

    if (emp.status !== "ACTIVE") {
      router.replace("/login");
      return;
    }

    if (!allow.includes(emp.role)) {
      router.replace(routeForRole(emp.role, emp.isDsiAdmin, emp.departmentType ?? null));
      return;
    }

    if (!hasRequiredProfileData(emp) && pathname !== "/onboarding") {
      router.replace("/onboarding");
      return;
    }
  }, [allow, pathname, router]);

  return <>{children}</>;
}
