"use client";

import { Sidebar } from "../../components/Sidebar";
import { ceoMenu } from "../../components/sidebar-menus";
import RequireRole from "../../components/RequireRole";

export default function CeoLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole allow={["CEO"]}>
      <div className="min-h-screen bg-gray-50">
        <Sidebar brandTitle="Mon espace RH" brandSubtitle="Espace PDG" sections={ceoMenu} />
        <div className="lg:pl-64 pt-[72px] lg:pt-0">{children}</div>
      </div>
    </RequireRole>
  );
}
