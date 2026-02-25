"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getToken, type EmployeeSession } from "@/lib/auth-client";
import toast from "react-hot-toast";
import { type ContractDocumentType } from "@/app/hooks/useContractDocumentTypes";

type EmployeeOption = {
  id: string;
  firstName: string;
  lastName: string;
  matricule?: string | null;
  email: string;
  role?: string;
};

type ContractDocument = {
  id: string;
  employeeId: string;
  fileName: string;
  createdAt: string;
  mimeType: string;
  contractDocumentType?: ContractDocumentType | null;
  employee?: EmployeeOption;
};

function employeeLabel(employee?: EmployeeOption) {
  if (!employee) return "Employé";
  const fullName = `${employee.firstName} ${employee.lastName}`.trim();
  if (employee.matricule) return `${fullName} (${employee.matricule})`;
  return fullName || employee.email;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

type MissingDocumentTypeSummary = {
  typeId: string;
  typeName: string;
  missingCount: number;
  totalEmployees: number;
  missingEmployeeIds: Set<string>;
};

function formatMissingLabel(missingCount: number) {
  if (missingCount <= 0) return "Tous les documents sont ajoutés";
  const pluralSuffix = missingCount > 1 ? "s" : "";
  return `${missingCount} collaborateur${pluralSuffix} manquant${pluralSuffix}`;
}

type Props = {
  employee: EmployeeSession;
  contractDocumentTypes: ContractDocumentType[];
  isContractDocumentTypesLoading?: boolean;
  showUploader?: boolean;
  showEmployeeFilter?: boolean;
  showTypeCards?: boolean;
  filterContractDocumentTypeId?: string;
  displayDocuments?: boolean;
  enableDocumentTypeFilter?: boolean;
  enableEmployeeFilter?: boolean;
  ownerEmployeeId?: string;
};

export default function ContractDocumentsSection({
  employee,
  contractDocumentTypes,
  isContractDocumentTypesLoading = false,
  showUploader = true,
  showEmployeeFilter = true,
  showTypeCards = true,
  filterContractDocumentTypeId = "",
  displayDocuments = true,
  enableDocumentTypeFilter = false,
  enableEmployeeFilter = false,
  ownerEmployeeId,
}: Props) {
  const [documents, setDocuments] = useState<ContractDocument[]>([]);
  const [uploadEmployeeId, setUploadEmployeeId] = useState(employee.id);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [highlightedDocumentTypeId, setHighlightedDocumentTypeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editSelectedFile, setEditSelectedFile] = useState<File | null>(null);
  const [isEditingDoc, setIsEditingDoc] = useState(false);
  const [documentTypeFilter, setDocumentTypeFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set<string>());
  useEffect(() => {
    if (!showEmployeeFilter && !showUploader && !enableEmployeeFilter) return;
    const token = getToken();
    if (!token) return;

    const loadEmployees = async () => {
      const res = await fetch("/api/employees/options?take=150", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const list = Array.isArray(data?.employees) ? (data.employees as EmployeeOption[]) : [];
      const filtered = list.filter((item) => item.role !== "CEO");
      setEmployees(filtered);
    };

    loadEmployees();
  }, [employee.id, showEmployeeFilter, showUploader]);


  const missingDocumentTypeSummaries = useMemo<MissingDocumentTypeSummary[]>(() => {
    if (contractDocumentTypes.length === 0) return [];
    const totalEmployees = employees.length;
    const docsByType = new Map<string, Set<string>>();
    for (const doc of documents) {
      const typeId = doc.contractDocumentType?.id;
      const employeeId = doc.employeeId;
      if (!typeId || !employeeId) continue;
      const set = docsByType.get(typeId) ?? new Set<string>();
      set.add(employeeId);
      docsByType.set(typeId, set);
    }

    const employeeIds = employees.map((emp) => emp.id);

    return contractDocumentTypes.map((type) => {
      const employeesWithType = docsByType.get(type.id) ?? new Set<string>();
      const missingEmployeeIds = new Set<string>();
      for (const id of employeeIds) {
        if (!employeesWithType.has(id)) {
          missingEmployeeIds.add(id);
        }
      }
      return {
        typeId: type.id,
        typeName: type.name,
        missingCount: Math.max(totalEmployees - employeesWithType.size, 0),
        totalEmployees,
        missingEmployeeIds,
      };
    });
  }, [contractDocumentTypes, documents, employees]);

  const missingDocumentTypeSummaryMap = useMemo(() => {
    const map = new Map<string, MissingDocumentTypeSummary>();
    for (const summary of missingDocumentTypeSummaries) {
      map.set(summary.typeId, summary);
    }
    return map;
  }, [missingDocumentTypeSummaries]);

  useEffect(() => {
    if (!showTypeCards) {
      setHighlightedDocumentTypeId(null);
      return;
    }
    if (contractDocumentTypes.length === 0) {
      setHighlightedDocumentTypeId(null);
      return;
    }
    setHighlightedDocumentTypeId((prev) =>
      prev && contractDocumentTypes.some((type) => type.id === prev) ? prev : contractDocumentTypes[0].id
    );
  }, [contractDocumentTypes, showTypeCards]);

  const filteredEmployeesForSelect = useMemo(() => {
    if (!showTypeCards) return [];
    if (!highlightedDocumentTypeId) return [];
    const summary = missingDocumentTypeSummaryMap.get(highlightedDocumentTypeId);
    if (!summary) return [];
    return employees.filter((emp) => summary.missingEmployeeIds.has(emp.id));
  }, [employees, highlightedDocumentTypeId, missingDocumentTypeSummaryMap, showTypeCards]);

  const highlightedTypeSummary = highlightedDocumentTypeId
    ? missingDocumentTypeSummaryMap.get(highlightedDocumentTypeId) ?? null
    : null;

  useEffect(() => {
    if (filteredEmployeesForSelect.length === 0) {
      setUploadEmployeeId("");
      return;
    }
    setUploadEmployeeId((prev) =>
      filteredEmployeesForSelect.some((item) => item.id === prev)
        ? prev
        : filteredEmployeesForSelect[0]?.id ?? ""
    );
  }, [filteredEmployeesForSelect]);

  const fetchDocuments = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    setIsLoading(true);
    try {
      const url = `/api/employee-documents?type=CONTRACT`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(data?.error ?? "Impossible de charger les contrats"));
        return;
      }
      setDocuments(Array.isArray(data?.documents) ? (data.documents as ContractDocument[]) : []);
    } catch (error) {
      toast.error("Erreur réseau lors du chargement des contrats");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const documentEmployees = useMemo(() => {
    const map = new Map<string, EmployeeOption>();
    for (const doc of documents) {
      const e = doc.employee;
      if (e?.id) {
        map.set(e.id, e);
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const nameA = `${a.lastName} ${a.firstName}`.trim();
      const nameB = `${b.lastName} ${b.firstName}`.trim();
      return nameA.localeCompare(nameB);
    });
  }, [documents]);

  const dynamicTypeOptions = useMemo(() => {
    if (!enableEmployeeFilter || !employeeFilter) return contractDocumentTypes;
    const typeIds = new Set<string>();
    for (const doc of documents) {
      if (doc.employeeId !== employeeFilter) continue;
      const typeId = doc.contractDocumentType?.id;
      if (typeId) typeIds.add(typeId);
    }
    return contractDocumentTypes.filter((type) => typeIds.has(type.id));
  }, [contractDocumentTypes, documents, enableEmployeeFilter, employeeFilter]);

  const dynamicEmployeeOptions = useMemo(() => {
    if (!enableDocumentTypeFilter || !documentTypeFilter) return documentEmployees;
    const employeeIds = new Set<string>();
    for (const doc of documents) {
      if (doc.contractDocumentType?.id !== documentTypeFilter) continue;
      const id = doc.employee?.id;
      if (id) {
        employeeIds.add(id);
      }
    }
    return documentEmployees.filter((emp) => employeeIds.has(emp.id));
  }, [documentEmployees, documents, enableDocumentTypeFilter, documentTypeFilter]);

  const highlightedDocumentTypeFilter =
    showTypeCards && highlightedDocumentTypeId ? highlightedDocumentTypeId : null;
  const activeDocumentTypeFilter = highlightedDocumentTypeFilter ?? (enableDocumentTypeFilter ? documentTypeFilter : filterContractDocumentTypeId);

  const filteredDocuments = useMemo(() => {
    let list = documents;
    if (ownerEmployeeId) {
      list = list.filter((doc) => doc.employeeId === ownerEmployeeId);
    } else {
      if (activeDocumentTypeFilter) {
        list = list.filter((doc) => doc.contractDocumentType?.id === activeDocumentTypeFilter);
      }
      if (enableEmployeeFilter && employeeFilter) {
        list = list.filter((doc) => doc.employeeId === employeeFilter);
      }
    }
    return list;
  }, [documents, activeDocumentTypeFilter, enableEmployeeFilter, employeeFilter, ownerEmployeeId]);

  useEffect(() => {
    if (!enableDocumentTypeFilter) {
      setDocumentTypeFilter("");
      return;
    }
    if (documentTypeFilter && !dynamicTypeOptions.some((type) => type.id === documentTypeFilter)) {
      setDocumentTypeFilter("");
    }
  }, [dynamicTypeOptions, documentTypeFilter, enableDocumentTypeFilter]);

  useEffect(() => {
    if (!enableEmployeeFilter) {
      setEmployeeFilter("");
      return;
    }
    if (employeeFilter && !dynamicEmployeeOptions.some((emp) => emp.id === employeeFilter)) {
      setEmployeeFilter("");
    }
  }, [dynamicEmployeeOptions, employeeFilter, enableEmployeeFilter]);

  const groupedDocuments = useMemo(() => {
    const buckets = new Map<string, ContractDocument[]>();
    for (const doc of filteredDocuments) {
      const key = doc.contractDocumentType?.name ?? "Sans catégorie";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(doc);
    }
    const result: Array<{ label: string; documents: ContractDocument[] }> = [];
    for (const [label, docs] of buckets.entries()) {
      docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      result.push({ label, documents: docs });
    }
    result.sort((a, b) => a.label.localeCompare(b.label));
    return result;
  }, [filteredDocuments]);

  const toggleGroupCollapse = (groupLabel: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupLabel)) {
        next.delete(groupLabel);
      } else {
        next.add(groupLabel);
      }
      return next;
    });
  };

  const uploadDocument = async () => {
    if (!selectedFile) {
      toast.error("Sélectionnez un fichier.");
      return;
    }
    if (!uploadEmployeeId) {
      toast.error("Sélectionnez un collaborateur pour ce type.");
      return;
    }
    if (!highlightedDocumentTypeId) {
      toast.error("Sélectionnez un type de document via les cartes.");
      return;
    }
    setIsUploading(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => reject(new Error("Impossible de lire le fichier"));
        reader.readAsDataURL(selectedFile);
      });
      const token = getToken();
      if (!token) return;
      const payload: Record<string, unknown> = {
        type: "CONTRACT",
        fileName: selectedFile.name,
        fileDataUrl: dataUrl,
        employeeId: uploadEmployeeId,
        contractDocumentTypeId: highlightedDocumentTypeId,
      };
      const res = await fetch("/api/employee-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(data?.error ?? "Erreur lors de l'envoi"));
        return;
      }
      toast.success("Document contractuel ajouté.");
      setSelectedFile(null);
      setFileInputKey((prev) => prev + 1);
      fetchDocuments();
    } catch (error) {
      toast.error("Erreur lors de la lecture du fichier.");
    } finally {
      setIsUploading(false);
    }
  };

  const openDocument = async (doc: ContractDocument) => {
    const token = getToken();
    if (!token) return;
    setOpeningDocId(doc.id);
    try {
      const res = await fetch(`/api/employee-documents/${doc.id}/file`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(String(data?.error ?? "Impossible d'ouvrir le document"));
        setOpeningDocId(null);
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = doc.fileName;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    } finally {
      setOpeningDocId(null);
    }
  };

  const deleteDocument = async (doc: ContractDocument) => {
    if (!window.confirm(`Supprimer "${doc.fileName}" ?`)) return;
    const token = getToken();
    if (!token) return;
    setDeletingDocId(doc.id);
    try {
      const res = await fetch(`/api/employee-documents/${doc.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(data?.error ?? "Erreur lors de la suppression"));
        return;
      }
      toast.success("Document supprimé.");
      fetchDocuments();
    } catch {
      toast.error("Erreur réseau lors de la suppression");
    } finally {
      setDeletingDocId(null);
    }
  };

  const startEditDocument = (doc: ContractDocument) => {
    setEditingDocId(doc.id);
    setEditSelectedFile(null);
  };

  const cancelEditDocument = () => {
    if (isEditingDoc) return;
    setEditingDocId(null);
    setEditSelectedFile(null);
  };

  const saveDocumentEdit = async (doc: ContractDocument) => {
    if (!editSelectedFile) {
      toast.error("Sélectionnez un fichier avant d'enregistrer.");
      return;
    }
    setIsEditingDoc(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => reject(new Error("Impossible de lire le fichier"));
        reader.readAsDataURL(editSelectedFile);
      });
      const token = getToken();
      if (!token) return;
      const payload = {
        fileName: editSelectedFile.name,
        fileDataUrl: dataUrl,
      };
      const res = await fetch(`/api/employee-documents/${doc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(data?.error ?? "Erreur lors de la modification"));
        return;
      }
      toast.success("Document modifié.");
      setEditingDocId(null);
      setEditSelectedFile(null);
      fetchDocuments();
    } catch {
      toast.error("Erreur réseau lors de la modification");
    } finally {
      setIsEditingDoc(false);
    }
  };

  return (
    <div className="bg-white border border-vdm-gold-200 rounded-xl p-6 space-y-6">
      <div>
        <div className="text-lg font-semibold text-vdm-gold-800">Documents RH</div>
      </div>

      {(enableDocumentTypeFilter || enableEmployeeFilter) && (
        <div className="grid gap-3 md:grid-cols-2">
          {enableDocumentTypeFilter && (
            <label className="text-sm text-vdm-gold-900">
              Filtrer par type
              <select
                value={documentTypeFilter}
                onChange={(event) => setDocumentTypeFilter(event.target.value)}
                className="mt-1 w-full rounded-md border border-vdm-gold-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
              >
                <option value="">Tous les types</option>
                {(dynamicTypeOptions.length === 0 ? contractDocumentTypes : dynamicTypeOptions).map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {enableEmployeeFilter && (
            <label className="text-sm text-vdm-gold-900">
              Filtrer par employé
              <select
                value={employeeFilter}
                onChange={(event) => setEmployeeFilter(event.target.value)}
                className="mt-1 w-full rounded-md border border-vdm-gold-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
              >
                <option value="">Tous les employés</option>
                {(dynamicEmployeeOptions.length === 0 ? documentEmployees : dynamicEmployeeOptions).length === 0 ? (
                  <option value="" disabled>
                    Aucun document associé à un collaborateur
                  </option>
                ) : (
                  (dynamicEmployeeOptions.length === 0 ? documentEmployees : dynamicEmployeeOptions).map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {employeeLabel(emp)}
                    </option>
                  ))
                )}
              </select>
            </label>
          )}
        </div>
      )}

      {(showEmployeeFilter && showTypeCards) || showUploader ? (
        <div className="space-y-3">
          {showEmployeeFilter && showTypeCards && (
            <>
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-vdm-gold-600 mb-1">Collaborateur concerné</div>
                  <select
                    value={uploadEmployeeId}
                    onChange={(e) => setUploadEmployeeId(e.target.value)}
                    className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                    disabled={!highlightedDocumentTypeId || filteredEmployeesForSelect.length === 0}
                  >
                    {!highlightedDocumentTypeId ? (
                      <option value="">Sélectionnez un type de document</option>
                    ) : filteredEmployeesForSelect.length === 0 ? (
                      <option value="">Aucun collaborateur concerné</option>
                    ) : (
                      filteredEmployeesForSelect.map((item) => (
                        <option key={item.id} value={item.id}>
                          {employeeLabel(item)}
                        </option>
                      ))
                    )}
                  </select>
                  {highlightedTypeSummary ? (
                    <div className="text-xs text-vdm-gold-600 mt-1">
                      {filteredEmployeesForSelect.length === 0
                        ? `Tous les collaborateurs ont déjà ${highlightedTypeSummary.typeName}.`
                        : `${filteredEmployeesForSelect.length} collaborateur(s) n’ont pas encore ${highlightedTypeSummary.typeName}.`}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-vdm-gold-600">Documents manquants par type</div>
                {contractDocumentTypes.length === 0 ? (
                  <div className="text-xs text-vdm-gold-600">
                    {isContractDocumentTypesLoading ? "Chargement des types..." : "Aucun type de document défini."}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {contractDocumentTypes.map((type) => {
                      const summary = missingDocumentTypeSummaryMap.get(type.id);
                      const missingCount = summary?.missingCount ?? employees.length;
                      const isFullyAvailable = missingCount <= 0;
                      const blockClass = isFullyAvailable
                        ? "border-vdm-gold-300 bg-vdm-gold-50 text-vdm-gold-900"
                        : "border-vdm-gold-200 bg-white text-vdm-gold-800 hover:bg-vdm-gold-50";
                      const label = isLoading || isContractDocumentTypesLoading ? "Chargement..." : formatMissingLabel(missingCount);
                      const isSelectedCard = highlightedDocumentTypeId === type.id;
                      const selectedClass = isSelectedCard ? "ring-2 ring-vdm-gold-300" : "";
                      return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() =>
                        setHighlightedDocumentTypeId((prev) => (prev === type.id ? null : type.id))
                      }
                      className={`rounded-lg border px-3 py-2 text-left ${blockClass} ${selectedClass}`}
                      aria-pressed={isSelectedCard}
                    >
                          <div className="text-sm font-semibold text-vdm-gold-900">{type.name}</div>
                          <div className="text-xs text-vdm-gold-700">{label}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
          {showUploader && (
            <div className="rounded-xl border border-vdm-gold-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-vdm-gold-900">Ajouter un document</div>
                  <p className="text-xs text-vdm-gold-600">
                    {highlightedTypeSummary
                      ? `Type ${highlightedTypeSummary.typeName}`
                      : "Sélectionnez un type de document via les cartes ci-dessus."}
                  </p>
                </div>
                {highlightedTypeSummary ? (
                  <div className="text-xs text-vdm-gold-600">
                    {filteredEmployeesForSelect.length === 0
                      ? "Aucun collaborateur concerné"
                      : `${filteredEmployeesForSelect.length} collaborateur(s) à traiter`}
                  </div>
                ) : null}
              </div>
              <div className="space-y-3">
                <label className="text-sm text-vdm-gold-900 block">
                  Document (PDF ou image)
                  <input
                    key={fileInputKey}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    className="mt-1 block w-full rounded-md border border-vdm-gold-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500 bg-white"
                  />
                </label>
                <button
                  type="button"
                  onClick={uploadDocument}
                  disabled={
                    isUploading ||
                    !selectedFile ||
                    !uploadEmployeeId ||
                    !highlightedDocumentTypeId ||
                    filteredEmployeesForSelect.length === 0
                  }
                  className="px-4 py-2 rounded-md bg-vdm-gold-700 text-white text-sm hover:bg-vdm-gold-800 disabled:opacity-60"
                >
                  {isUploading ? "Envoi..." : "Ajouter le document"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {displayDocuments ? (
        <>
          <div className="space-y-4">
            {isLoading ? (
              <div className="text-sm text-vdm-gold-700">Chargement des documents...</div>
            ) : documents.length === 0 ? (
              <div className="text-sm text-vdm-gold-700">Aucun document pour le moment.</div>
            ) : (
              groupedDocuments.map((group) => {
                const isCollapsed = collapsedGroups.has(group.label);
                return (
                  <div key={group.label} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-vdm-gold-800">{group.label}</div>
                        <div className="text-xs text-vdm-gold-600">{group.documents.length} document(s)</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleGroupCollapse(group.label)}
                        className="text-xs text-vdm-gold-600 hover:text-vdm-gold-900 focus:outline-none"
                      >
                        {isCollapsed ? "Afficher" : "Masquer"}
                      </button>
                    </div>
                    {isCollapsed ? (
                      <div className="text-xs text-vdm-gold-500">Section repliée. Cliquez sur "Afficher".</div>
                    ) : (
                      <div className="space-y-3">
                        {group.documents.map((doc) => (
                          <div key={doc.id} className="border border-vdm-gold-200 rounded-md p-3 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm font-semibold text-vdm-gold-900">{doc.fileName}</div>
                                <div className="text-xs text-vdm-gold-700">
                                  {employeeLabel(doc.employee)} · ajouté le {formatDate(doc.createdAt)}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => openDocument(doc)}
                                  disabled={openingDocId === doc.id}
                                  className="px-3 py-1 rounded-md border border-vdm-gold-300 text-xs text-vdm-gold-800 hover:bg-vdm-gold-50"
                                >
                                  {openingDocId === doc.id ? "Ouverture..." : "Ouvrir"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startEditDocument(doc)}
                                  disabled={editingDocId === doc.id}
                                  className="px-3 py-1 rounded-md border border-vdm-gold-300 text-xs text-vdm-gold-800 hover:bg-vdm-gold-50"
                                >
                                  Modifier
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteDocument(doc)}
                                  disabled={deletingDocId === doc.id}
                                  className="px-3 py-1 rounded-md border border-red-300 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                                >
                                  {deletingDocId === doc.id ? "Suppression..." : "Supprimer"}
                                </button>
                              </div>
                            </div>
                            {editingDocId === doc.id ? (
                              <div className="flex flex-col gap-2">
                                <input
                                  type="file"
                                  accept="application/pdf,image/jpeg,image/png,image/webp"
                                  onChange={(e) => setEditSelectedFile(e.target.files?.[0] ?? null)}
                                  className="w-full border border-vdm-gold-200 rounded-md p-2 text-xs focus:outline-none focus:ring-2 focus:ring-vdm-gold-500 bg-white"
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => saveDocumentEdit(doc)}
                                    disabled={isEditingDoc || !editSelectedFile}
                                    className="px-3 py-1 rounded-md bg-vdm-gold-700 text-white text-xs hover:bg-vdm-gold-800 disabled:opacity-60"
                                  >
                                    {isEditingDoc ? "Enregistrement..." : "Sauvegarder"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelEditDocument}
                                    disabled={isEditingDoc}
                                    className="px-3 py-1 rounded-md border border-vdm-gold-300 text-xs text-vdm-gold-800 hover:bg-vdm-gold-50"
                                  >
                                    Annuler
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <section className="">
          {/* 
          L'affichage des documents contractuels sera disponible dans une section dédiée juste en dessous. 
          ------------------------------------------------------------------------------------------------
          section className="rounded-xl border border-vdm-gold-200 bg-white p-4 text-sm text-vdm-gold-700"
          */}
        </section>
      )}
    </div>
  );
}
