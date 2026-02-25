"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { getToken } from "@/lib/auth-client";

type ContractDocumentType = {
  id: string;
  name: string;
  createdAt: string;
};

export type { ContractDocumentType };

export function useContractDocumentTypes() {
  const [contractDocumentTypes, setContractDocumentTypes] = useState<ContractDocumentType[]>([]);
  const [isContractDocumentTypesLoading, setIsContractDocumentTypesLoading] = useState(false);

  const refreshContractDocumentTypes = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setContractDocumentTypes([]);
      return;
    }

    setIsContractDocumentTypesLoading(true);
    try {
      const res = await fetch("/api/contract-document-types", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(data?.error ?? "Impossible de charger les types de contrats"));
        setContractDocumentTypes([]);
        return;
      }
      setContractDocumentTypes(Array.isArray(data?.types) ? data.types : []);
    } catch (error) {
      toast.error("Erreur réseau lors du chargement des types de contrats");
      setContractDocumentTypes([]);
    } finally {
      setIsContractDocumentTypesLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshContractDocumentTypes();
  }, [refreshContractDocumentTypes]);

  return {
    contractDocumentTypes,
    refreshContractDocumentTypes,
    isContractDocumentTypesLoading,
  };
}
