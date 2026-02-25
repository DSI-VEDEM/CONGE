"use client";

import { getEmployee } from "@/lib/auth-client";

function roleLabel(role?: string | null) {
  if (!role) return "";
  if (role === "DEPT_HEAD") return "Directeur de Département";
  if (role === "SERVICE_HEAD") return "Directeur Adjoint";
  if (role === "ACCOUNTANT") return "Comptable";
  if (role === "CEO") return "PDG";
  if (role === "EMPLOYEE") return "Employé";
  return role;
}

export default function DashboardShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const employee = getEmployee();
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center">
          <div>
            <div className="text-lg font-semibold text-vdm-gold-800">{title}</div>
            <div className="text-sm text-gray-600">
              {employee ? `${employee.firstName} ${employee.lastName} — ${roleLabel(employee.role)}` : ""}
            </div>
          </div>

        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
