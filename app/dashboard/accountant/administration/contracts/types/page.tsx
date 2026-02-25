"use client";

import { useMemo } from "react";
import { getEmployee } from "@/lib/auth-client";
import RoleGate from "@/app/components/RoleGate";
import RequireAuth from "@/app/components/RequireAuth";
import ContractDocumentTypeManager from "@/app/components/ContractDocumentTypeManager";
import ContractDocumentsSection from "@/app/components/ContractDocumentsSection";
import { useContractDocumentTypes } from "@/app/hooks/useContractDocumentTypes";

export default function AccountantContractTypesPage() {
  const employee = useMemo(() => getEmployee(), []);
  const { contractDocumentTypes, refreshContractDocumentTypes, isContractDocumentTypesLoading } =
    useContractDocumentTypes();
  return (
    <RequireAuth>
      <RoleGate allow={["ACCOUNTANT"]}>
        <div className="p-6 space-y-6">
          <div>
            <div className="text-xl font-semibold mb-1 text-vdm-gold-800">Types de documents contractuels</div>
            <p className="text-sm text-vdm-gold-700">
              Ajoutez une catégorie, puis consultez les documents déposés par type.
            </p>
          </div>
          <div className="rounded-xl border border-vdm-gold-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-base font-semibold text-vdm-gold-900">Ajouter un type</div>
                <p className="text-xs text-vdm-gold-500">Les nouveaux types seront visibles dans la liste ci-dessous.</p>
              </div>
              <button
                type="button"
                onClick={refreshContractDocumentTypes}
                className="px-3 py-1.5 rounded-full border border-vdm-gold-300 text-xs text-vdm-gold-800 hover:bg-vdm-gold-50"
              >
                Rafraîchir
              </button>
            </div>
            <ContractDocumentTypeManager
              contractDocumentTypes={contractDocumentTypes}
              onRefresh={refreshContractDocumentTypes}
            />
          </div>

          <section className="rounded-xl border border-vdm-gold-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-vdm-gold-900">Documents par type</h2>
                <p className="text-xs text-vdm-gold-500">Parcourez les fichiers contractuels groupés par type.</p>
              </div>
            </div>
            {employee ? (
              <ContractDocumentsSection
                employee={employee}
                contractDocumentTypes={contractDocumentTypes}
                isContractDocumentTypesLoading={isContractDocumentTypesLoading}
                showUploader
                displayDocuments={false}
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
