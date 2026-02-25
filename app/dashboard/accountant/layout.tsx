"use client";

import { Sidebar } from "../../components/Sidebar";
import { accountantMenu } from "../../components/sidebar-menus";
import RequireRole from "../../components/RequireRole";

export default function AccountantLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole allow={["ACCOUNTANT"]}>
      <div className="min-h-screen bg-gray-50">
        <Sidebar brandTitle="Mon espace RH" brandSubtitle="Espace Comptable" sections={accountantMenu} />
        <div className="lg:pl-64 pt-[72px] lg:pt-0">{children}</div>
      </div>
    </RequireRole>
  );
}
