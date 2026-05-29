"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "../../components/Sidebar";
import { employeeMenuForDafDelegate } from "../../components/sidebar-menus";
import RequireAuth from "../../components/RequireAuth";
import { getEmployee, type EmployeeSession } from "@/lib/auth-client";

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const [employee, setEmployee] = useState<EmployeeSession | null>(null);

  useEffect(() => {
    setEmployee(getEmployee());
  }, []);

  const sections = employeeMenuForDafDelegate(employee?.dafPermissions ?? null);

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-50">
        <Sidebar brandTitle="Mon espace RH" brandSubtitle="Espace Employé" sections={sections} />
        <div className="lg:pl-64 pt-[72px] lg:pt-0">{children}</div>
      </div>
    </RequireAuth>
  );
}
