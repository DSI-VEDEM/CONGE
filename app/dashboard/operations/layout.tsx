import { Sidebar } from "../../components/Sidebar";
import RequireOperationsDirector from "../../components/RequireOperationsDirector";
import { operationsMenu } from "../../components/sidebar-menus-operations";

export default function OperationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireOperationsDirector>
      <div className="min-h-screen bg-gray-50">
        <Sidebar brandTitle="Mon espace RH" brandSubtitle="Espace Operations" sections={operationsMenu} />
        <div className="lg:pl-64 pt-[72px] lg:pt-0">{children}</div>
      </div>
    </RequireOperationsDirector>
  );
}
