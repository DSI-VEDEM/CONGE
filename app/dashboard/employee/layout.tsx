"use client";

import { Sidebar } from "../../components/Sidebar";
import { employeeMenu } from "../../components/sidebar-menus";
import RequireAuth from "../../components/RequireAuth";

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-50">
        <Sidebar
          brandTitle="Mon espace RH"
          brandSubtitle="Espace Employé"
          sections={employeeMenu}
        />
        <div className="lg:pl-64 pt-[72px] lg:pt-0">{children}</div>
      </div>
    </RequireAuth>
  );
}
