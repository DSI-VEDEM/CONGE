"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getEmployee, getToken, hasRequiredProfileData, routeForRole } from "@/lib/auth-client";

export default function DashboardIndex() {
  const router = useRouter();

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

    if (!hasRequiredProfileData(emp)) {
      router.replace("/onboarding");
      return;
    }

    router.replace(routeForRole(emp.role, emp.isDsiAdmin, emp.departmentType ?? null));
  }, [router]);

  return null;
}
