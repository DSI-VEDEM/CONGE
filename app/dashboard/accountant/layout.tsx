"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "../../components/Sidebar";
import { accountantMenu, dafDelegateMenu } from "../../components/sidebar-menus";
import RequireAccountantOrDafDelegate from "../../components/RequireAccountantOrDafDelegate";
import { getEmployee, isDafLeader, type EmployeeSession } from "@/lib/auth-client";

export default function AccountantLayout({ children }: { children: React.ReactNode }) {
  const [employee, setEmployee] = useState<EmployeeSession | null>(null);

  useEffect(() => {
    setEmployee(getEmployee());
  }, []);

  const isDafDirector = employee ? isDafLeader(employee.role, employee.departmentType ?? null) : false;
  const sections = isDafDirector ? accountantMenu : dafDelegateMenu(employee?.dafPermissions ?? null);

  return (
    <RequireAccountantOrDafDelegate>
      <div className="min-h-screen bg-gray-50">
        <Sidebar
          brandTitle="Mon espace RH"
          brandSubtitle={isDafDirector ? "Espace DAF" : "Délégation DAF"}
          sections={sections}
        />
        <div className="lg:pl-64 pt-[72px] lg:pt-0">{children}</div>
      </div>
    </RequireAccountantOrDafDelegate>
  );
}
