import { Sidebar } from "../../components/Sidebar";
import RequireDsiAdmin from "../../components/RequireDsiAdmin";
import { dsiMenu } from "../../components/sidebar-menus-dsi";

export default function DsiLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireDsiAdmin>
      <div className="min-h-screen bg-gray-50">
        <Sidebar brandTitle="Mon espace RH" brandSubtitle="Espace DSI (Admin)" sections={dsiMenu} />
        <div className="lg:pl-64 pt-[72px] lg:pt-0">{children}</div>
      </div>
    </RequireDsiAdmin>
  );
}
