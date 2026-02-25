"use client";

import { useMemo } from "react";
import { getEmployee } from "@/lib/auth-client";
import RoleGate from "@/app/components/RoleGate";
import RequireAuth from "@/app/components/RequireAuth";
import ContractDocumentsSection from "@/app/components/ContractDocumentsSection";
import { useContractDocumentTypes } from "@/app/hooks/useContractDocumentTypes";

export default function CeoContractDocumentsPage() {
  const employee = useMemo(() => getEmployee(), []);
  const { contractDocumentTypes, isContractDocumentTypesLoading } = useContractDocumentTypes();

  return (
    <RequireAuth>
      <RoleGate allow={["CEO"]}>
        <div className="p-6 space-y-6">
          <div>
            <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Documents contractuels</div>
            <p className="text-sm text-vdm-gold-700">
              Retrouvez ici tous les documents déposés par type et par collaborateur.
            </p>
          </div>

          <section className="rounded-xl border border-vdm-gold-200 bg-white p-6">
            {employee ? (
              <ContractDocumentsSection
                employee={employee}
                contractDocumentTypes={contractDocumentTypes}
                isContractDocumentTypesLoading={isContractDocumentTypesLoading}
                showUploader={false}
                showEmployeeFilter={false}
                showTypeCards={false}
                displayDocuments
                enableDocumentTypeFilter
                enableEmployeeFilter
              />
            ) : (
              <div className="rounded-xl border border-vdm-gold-200 bg-white p-4 text-sm text-vdm-gold-700">
                Aucune session active.
              </div>
            )}
          </section>
        </div>
      </RoleGate>
    </RequireAuth>
  );
}
