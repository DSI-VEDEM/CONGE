"use client";

import { useMemo } from "react";
import { getEmployee } from "@/lib/auth-client";
import EmployeeDocumentsSection from "@/app/components/EmployeeDocumentsSection";

type ContractsPageProps = {
  title?: string;
  description?: string;
  scope?: "employees" | "default" | "self";
};

export default function ContractsPage({
  title = "Administration des contrats",
  description =
    "Liste des contrats, avenants et documents administratifs partagés par la comptable pour les collaborateurs.",
  scope = "employees",
}: ContractsPageProps) {
  const employee = useMemo(() => getEmployee(), []);
  return (
    <div className="p-6">
      <div className="text-xl font-semibold mb-1 text-vdm-gold-800">{title}</div>
      <p className="text-sm text-vdm-gold-700 mb-6">{description}</p>
      {employee ? (
        <EmployeeDocumentsSection employee={employee} scope={scope} />
      ) : (
        <div className="bg-white border border-vdm-gold-200 rounded-xl p-4 text-sm text-vdm-gold-700">
          Aucune session active.
        </div>
      )}
    </div>
  );
}
