"use client";

import ContractsPage from "@/app/components/ContractsPage";

export default function EmployeeContractsPage() {
  return (
    <ContractsPage
      title="Contrats personnels"
      description="Retrouvez la copie de vos contrats et documents administratifs partagés par la comptable."
      scope="self"
    />
  );
}
