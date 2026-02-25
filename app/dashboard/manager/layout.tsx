"use client";

import { Sidebar } from "../../components/Sidebar";
import { managerMenu } from "../../components/sidebar-menus";
import RequireManagerDeptHead from "../../components/RequireManagerDeptHead";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireManagerDeptHead>
      <div className="min-h-screen bg-gray-50">
        <Sidebar brandTitle="Mon espace RH" brandSubtitle="Espace Sous-Directeur" sections={managerMenu} />
        <div className="lg:pl-64 pt-[72px] lg:pt-0">{children}</div>
      </div>
    </RequireManagerDeptHead>
  );
}
