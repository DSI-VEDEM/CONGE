"use client";

import { useMemo } from "react";
import { getEmployee } from "@/lib/auth-client";
import ContractDocumentsSection from "@/app/components/ContractDocumentsSection";
import { useContractDocumentTypes } from "@/app/hooks/useContractDocumentTypes";

export default function DsiAdministrationContractsPage() {
  const employee = useMemo(() => getEmployee(), []);
  const { contractDocumentTypes, isContractDocumentTypesLoading } = useContractDocumentTypes();

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Mes contrats</div>
        <p className="text-sm text-vdm-gold-700">
          Retrouvez ici vos documents contractuels classés par type.
        </p>
      </div>
      {employee ? (
          <ContractDocumentsSection
            employee={employee}
            contractDocumentTypes={contractDocumentTypes}
            isContractDocumentTypesLoading={isContractDocumentTypesLoading}
            showUploader={false}
            showEmployeeFilter={false}
          />
      ) : (
        <div className="bg-white border border-vdm-gold-200 rounded-xl p-4 text-sm text-vdm-gold-700">
          Aucune session active.
        </div>
      )}
    </div>
  );
}
