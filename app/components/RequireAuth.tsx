"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getEmployee, getToken, hasRequiredProfileData } from "@/lib/auth-client";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = getToken();
    const employee = getEmployee();

    if (!token || !employee) {
      router.replace("/login");
      return;
    }

    // Si compte pas validé => pas d'accès dashboard
    if (employee.status !== "ACTIVE") {
      router.replace("/login");
      return;
    }

    if (!hasRequiredProfileData(employee) && pathname !== "/onboarding") {
      router.replace("/onboarding");
      return;
    }

    window.setTimeout(() => setChecked(true), 0);
  }, [pathname, router]);

  if (!checked) return null;
  return <>{children}</>;
}
