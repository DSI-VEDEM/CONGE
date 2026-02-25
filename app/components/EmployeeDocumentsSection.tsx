"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getToken, type EmployeeSession } from "@/lib/auth-client";
import toast from "react-hot-toast";
import { documentRequiresValidityDate } from "@/lib/document-validity";

export const DEFAULT_DOCUMENT_TYPES = [
  { value: "CONTRACT", label: "Contrat / avenant" },
  { value: "ID_CARD", label: "CNI" },
  { value: "DRIVING_LICENSE", label: "Permis de conduire" },
  { value: "BIRTH_CERTIFICATE", label: "Extrait de naissance" },
  { value: "SPOUSE_BIRTH_CERTIFICATE", label: "Extrait du conjoint" },
  { value: "CHILD_BIRTH_CERTIFICATE", label: "Extrait de naissance d’un enfant" },
  { value: "CURRICULUM_VITAE", label: "Curriculum Vitae (CV)" },
  { value: "COVER_LETTER", label: "Lettre de motivation" },
  { value: "GEOGRAPHIC_LOCATION", label: "Localisation géographique" },
] as const;

export type DocumentTypeItem = (typeof DEFAULT_DOCUMENT_TYPES)[number];
export type DocumentType = DocumentTypeItem["value"];
export const PROFILE_DOCUMENT_TYPES = DEFAULT_DOCUMENT_TYPES.filter((item) => item.value !== "CONTRACT");

type EmployeeOption = {
  id: string;
  firstName: string;
  lastName: string;
  matricule?: string | null;
  email: string;
  role?: string;
  profilePhotoUrl?: string | null;
};

type EmployeeDocument = {
  id: string;
  employeeId: string;
  type: DocumentType;
  relatedPersonName?: string | null;
  childOrder?: number | null;
  validUntil?: string | null;
  fileName: string;
  mimeType: string;
  fileDataUrl?: string;
  createdAt: string;
  updatedAt?: string;
  employee?: EmployeeOption;
  uploadedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  };
};

const ALL_EMPLOYEES_VALUE = "__ALL__";
const PAGE_SIZE = 30;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function toDateInputString(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatValidityDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR", {
    dateStyle: "medium",
  });
}

function typeLabel(type: string, documentTypes: readonly DocumentTypeItem[]) {
  return documentTypes.find((item) => item.value === type)?.label ?? type;
}

function employeeLabel(employee?: EmployeeOption) {
  if (!employee) return "Employé";
  const fullName = `${employee.firstName} ${employee.lastName}`.trim();
  if (employee.matricule) return `${fullName} (${employee.matricule})`;
  return fullName || employee.email;
}

function canReadAll(role?: string | null) {
  return role === "CEO" || role === "ACCOUNTANT";
}

async function toDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Impossible de lire le fichier"));
    reader.readAsDataURL(file);
  });
}

type Props = {
  employee: EmployeeSession;
  scope?: "default" | "self" | "employees";
  documentTypes?: readonly DocumentTypeItem[];
  filtersInlineOnLarge?: boolean;
};

export default function EmployeeDocumentsSection({
  employee,
  scope = "default",
  documentTypes: documentTypesProp,
  filtersInlineOnLarge = false,
}: Props) {
  const isSelfScope = scope === "self";
  const isEmployeesScope = scope === "employees";
  const documentTypes = documentTypesProp ?? DEFAULT_DOCUMENT_TYPES;
  const isReadAllRole = canReadAll(employee.role);
  const hasGlobalAccess = isReadAllRole && !isSelfScope;
  const canUploadDocuments = employee.role !== "CEO" && !isEmployeesScope;
  const allEmployeesLabel = isEmployeesScope ? "Tous les employés" : "Tous les employés";
  const filtersGridClass = filtersInlineOnLarge ? "grid gap-3 lg:grid-cols-2" : "grid gap-3 md:grid-cols-3";
  const employeeFilterWrapperClass = filtersInlineOnLarge
    ? "lg:col-span-1"
    : "md:col-span-3 grid gap-3 md:grid-cols-2";

  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [uploadOwnerDocuments, setUploadOwnerDocuments] = useState<EmployeeDocument[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMoreDocuments, setHasMoreDocuments] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(employee.id);
  const [selectedType, setSelectedType] = useState<DocumentType>("ID_CARD");
  const [viewTypeFilter, setViewTypeFilter] = useState<DocumentType | "ALL">("ALL");
  const [collapsedTypes, setCollapsedTypes] = useState<Set<DocumentType>>(() => new Set<DocumentType>());
  const [relatedPersonName, setRelatedPersonName] = useState("");
  const [childOrder, setChildOrder] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoPreviewLabel, setPhotoPreviewLabel] = useState<string>("Photo de profil");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editType, setEditType] = useState<DocumentType>("ID_CARD");
  const [editRelatedPersonName, setEditRelatedPersonName] = useState("");
  const [editChildOrder, setEditChildOrder] = useState("");
  const [editValidUntil, setEditValidUntil] = useState("");
  const [editSelectedFile, setEditSelectedFile] = useState<File | null>(null);
  const [editFileInputKey, setEditFileInputKey] = useState(0);
  const [isEditingBusy, setIsEditingBusy] = useState(false);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);
  const [deleteModalDoc, setDeleteModalDoc] = useState<EmployeeDocument | null>(null);

  const isEditingChildType = editType === "CHILD_BIRTH_CERTIFICATE";
  const isEditingNeedsRelatedName =
    editType === "SPOUSE_BIRTH_CERTIFICATE" || editType === "CHILD_BIRTH_CERTIFICATE";
  const isEditingNeedsValidityDate = documentRequiresValidityDate(editType);
  useEffect(() => {
    if (!isEditingNeedsValidityDate) {
      setEditValidUntil("");
    }
  }, [isEditingNeedsValidityDate]);

  useEffect(() => {
    if (isSelfScope || !hasGlobalAccess) {
      setSelectedEmployeeId(employee.id);
      return;
    }
    setSelectedEmployeeId(ALL_EMPLOYEES_VALUE);
  }, [employee.id, hasGlobalAccess, isSelfScope]);

  useEffect(() => {
    if (viewTypeFilter === "ALL") return;
    if (!documentTypes.some((item) => item.value === viewTypeFilter)) {
      setViewTypeFilter("ALL");
    }
  }, [documentTypes, viewTypeFilter]);

  const loadDocuments = useCallback(
    async ({
      pageNumber,
      append = false,
      signal,
    }: {
      pageNumber: number;
      append?: boolean;
      signal?: AbortSignal;
    }) => {
      const token = getToken();
      if (!token) return;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      const params = new URLSearchParams();
      if (isSelfScope) {
        params.set("employeeId", employee.id);
      } else if (hasGlobalAccess && selectedEmployeeId !== ALL_EMPLOYEES_VALUE) {
        params.set("employeeId", selectedEmployeeId);
      } else if (!hasGlobalAccess) {
        params.set("employeeId", employee.id);
      }
      if (isEmployeesScope) {
        params.set("excludeEmployeeId", employee.id);
      }

      params.set("take", String(PAGE_SIZE + 1));
      params.set("skip", String(pageNumber * PAGE_SIZE));

      try {
        const res = await fetch(`/api/employee-documents?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(String(data?.error ?? "Impossible de charger les documents"));
          return;
        }
        const nextDocuments = Array.isArray(data?.documents) ? (data.documents as EmployeeDocument[]) : [];
        const hasMore = nextDocuments.length > PAGE_SIZE;
        const trimmed = hasMore ? nextDocuments.slice(0, PAGE_SIZE) : nextDocuments;
        if (append) {
          setDocuments((prev) => [...prev, ...trimmed]);
        } else {
          setDocuments(trimmed);
        }
        setHasMoreDocuments(hasMore);
        setPage(pageNumber + 1);
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        toast.error("Impossible de charger les documents");
      } finally {
        if (append) {
          setIsLoadingMore(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [employee.id, hasGlobalAccess, isEmployeesScope, isSelfScope, selectedEmployeeId]
  );

  const loadMoreDocuments = useCallback(() => {
    if (isLoadingMore || !hasMoreDocuments) return;
    loadDocuments({ pageNumber: page, append: true });
  }, [hasMoreDocuments, isLoadingMore, loadDocuments, page]);

  const refreshUploadOwnerDocuments = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`/api/employee-documents?employeeId=${employee.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const list = Array.isArray(data?.documents) ? (data.documents as EmployeeDocument[]) : [];
    setUploadOwnerDocuments(list);
  }, [employee.id]);

  useEffect(() => {
    if (!hasGlobalAccess) return;
    const token = getToken();
    if (!token) return;

    const loadEmployees = async () => {
      const res = await fetch("/api/employees/options?take=150", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const list = Array.isArray(data?.employees) ? (data.employees as EmployeeOption[]) : [];
      setEmployees(list.filter((item) => item.role !== "CEO" && (!isEmployeesScope || item.id !== employee.id)));
    };

    loadEmployees();
  }, [employee.id, hasGlobalAccess, isEmployeesScope]);

  useEffect(() => {
    const controller = new AbortController();
    const frame = window.requestAnimationFrame(() => {
      setPage(0);
      setDocuments([]);
      setHasMoreDocuments(false);
      loadDocuments({ pageNumber: 0, append: false, signal: controller.signal }).catch((e: unknown) => {
        if ((e as Error)?.name === "AbortError") return;
        toast.error("Impossible de charger les documents");
        setIsLoading(false);
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      controller.abort();
    };
  }, [loadDocuments]);

  useEffect(() => {
    if (!canUploadDocuments) return;
    const frame = window.requestAnimationFrame(() => {
      refreshUploadOwnerDocuments();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [canUploadDocuments, refreshUploadOwnerDocuments]);

  useEffect(() => {
    if (!photoPreviewUrl) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPhotoPreviewUrl(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [photoPreviewUrl]);

  const uploadOwnerTypeSet = useMemo(() => {
    const set = new Set<string>();
    for (const doc of uploadOwnerDocuments) {
      if (doc.type === "CHILD_BIRTH_CERTIFICATE") continue;
      set.add(doc.type);
    }
    return set;
  }, [uploadOwnerDocuments]);

  const hasChildren = typeof employee.childrenCount === "number" && employee.childrenCount > 0;
  const isMarried = employee.maritalStatus === "MARRIED";
  const childDocumentCount = useMemo(
    () => uploadOwnerDocuments.filter((doc) => doc.type === "CHILD_BIRTH_CERTIFICATE").length,
    [uploadOwnerDocuments]
  );
  const availableUploadTypes = useMemo(
    () =>
      documentTypes.filter(
        (item) => {
          if (item.value === "CHILD_BIRTH_CERTIFICATE" && !hasChildren) return false;
          if (
            item.value === "CHILD_BIRTH_CERTIFICATE" &&
            typeof employee.childrenCount === "number" &&
            childDocumentCount >= employee.childrenCount
          ) {
            return false;
          }
          if (item.value === "SPOUSE_BIRTH_CERTIFICATE" && !isMarried) return false;
          return item.value === "CHILD_BIRTH_CERTIFICATE" || !uploadOwnerTypeSet.has(item.value);
        }
      ),
    [uploadOwnerTypeSet, documentTypes, hasChildren, isMarried, childDocumentCount, employee.childrenCount]
  );
  const effectiveSelectedType = useMemo(
    () =>
      availableUploadTypes.some((item) => item.value === selectedType)
        ? selectedType
        : (availableUploadTypes[0]?.value ?? "CHILD_BIRTH_CERTIFICATE"),
    [availableUploadTypes, selectedType]
  );
  const needsRelatedName =
    effectiveSelectedType === "SPOUSE_BIRTH_CERTIFICATE" || effectiveSelectedType === "CHILD_BIRTH_CERTIFICATE";
  const isChildType = effectiveSelectedType === "CHILD_BIRTH_CERTIFICATE";
  const needsValidityDate = documentRequiresValidityDate(effectiveSelectedType);
  const isUploadButtonDisabled =
    isUploading ||
    availableUploadTypes.length === 0 ||
    !selectedFile ||
    (needsRelatedName && !relatedPersonName.trim()) ||
    (needsValidityDate && !validUntil);
  useEffect(() => {
    if (!needsValidityDate) {
      setValidUntil("");
    }
  }, [needsValidityDate]);

  const uploadDocument = async () => {
    if (!canUploadDocuments) {
      toast.error("Le PDG ne peut pas ajouter de documents RH.");
      return;
    }
    const token = getToken();
    if (!token) return;
    if (!selectedFile) {
      toast.error("Sélectionnez un fichier avant l'envoi.");
      return;
    }

    setIsUploading(true);

    if (needsRelatedName && !relatedPersonName.trim()) {
      toast.error("Le nom du conjoint ou de l’enfant est obligatoire.");
      setIsUploading(false);
      return;
    }
    if (needsValidityDate && !validUntil) {
      toast.error("La date de validité est obligatoire pour ce document.");
      setIsUploading(false);
      return;
    }

    try {
      const fileDataUrl = await toDataUrl(selectedFile);
      if (!fileDataUrl) {
        toast.error("Fichier invalide.");
        setIsUploading(false);
        return;
      }

      const payload: Record<string, unknown> = {
        type: effectiveSelectedType,
        fileName: selectedFile.name,
        fileDataUrl,
      };
      if (needsRelatedName) {
        payload.relatedPersonName = relatedPersonName.trim();
      }
      if (isChildType && childOrder.trim()) {
        const parsedChildOrder = Number(childOrder.trim());
        if (!Number.isInteger(parsedChildOrder) || parsedChildOrder <= 0) {
          toast.error("Le rang de l’enfant doit être un entier positif.");
          setIsUploading(false);
          return;
        }
        payload.childOrder = parsedChildOrder;
      }
      payload.validUntil = validUntil || null;

      const res = await fetch("/api/employee-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(data?.error ?? "Erreur lors de l'envoi du document"));
        setIsUploading(false);
        return;
      }

      toast.success("Document ajouté avec succès.");
      setSelectedFile(null);
      setRelatedPersonName("");
      setChildOrder("");
      setValidUntil("");
      setFileInputKey((prev) => prev + 1);
      await loadDocuments({ pageNumber: 0, append: false });
      await refreshUploadOwnerDocuments();
      setIsUploading(false);
    } catch {
      toast.error("Erreur lors de la lecture du fichier.");
      setIsUploading(false);
    }
  };

  const canManageDocument = (doc: EmployeeDocument) => {
    if (employee.role === "CEO") return false;
    if (isSelfScope && doc.employeeId !== employee.id) return false;
    if (isEmployeesScope && doc.employeeId === employee.id) return false;
    if (employee.role === "ACCOUNTANT") return doc.employee?.role !== "CEO";
    return doc.employeeId === employee.id;
  };

  const startEditDocument = (doc: EmployeeDocument) => {
    setEditingId(doc.id);
    setEditType(doc.type);
    setEditRelatedPersonName(doc.relatedPersonName ?? "");
    setEditChildOrder(doc.childOrder ? String(doc.childOrder) : "");
    setEditSelectedFile(null);
    setEditFileInputKey((v) => v + 1);
    setEditValidUntil(toDateInputString(doc.validUntil ?? null));
  };

  const cancelEditDocument = () => {
    if (isEditingBusy) return;
    setEditingId(null);
    setEditSelectedFile(null);
    setEditRelatedPersonName("");
    setEditChildOrder("");
  };

  const saveEditDocument = async (doc: EmployeeDocument) => {
    const token = getToken();
    if (!token) return;

    setIsEditingBusy(true);
    try {
      const payload: Record<string, unknown> = {
        type: editType,
        relatedPersonName: isEditingNeedsRelatedName ? editRelatedPersonName.trim() : null,
      };

      if (isEditingNeedsRelatedName && !editRelatedPersonName.trim()) {
        toast.error("Le nom du conjoint ou de l’enfant est obligatoire.");
        setIsEditingBusy(false);
        return;
      }

      if (isEditingChildType && editChildOrder.trim()) {
        const parsedChildOrder = Number(editChildOrder.trim());
        if (!Number.isInteger(parsedChildOrder) || parsedChildOrder <= 0) {
          toast.error("Le rang de l’enfant doit être un entier positif.");
          setIsEditingBusy(false);
          return;
        }
        payload.childOrder = parsedChildOrder;
      } else {
        payload.childOrder = null;
      }

      if (isEditingNeedsValidityDate && !editValidUntil) {
        toast.error("La date de validité est obligatoire pour ce document.");
        setIsEditingBusy(false);
        return;
      }
      payload.validUntil = isEditingNeedsValidityDate ? editValidUntil : null;

      if (editSelectedFile) {
        const fileDataUrl = await toDataUrl(editSelectedFile);
        if (!fileDataUrl) {
          toast.error("Fichier invalide.");
          setIsEditingBusy(false);
          return;
        }
        payload.fileName = editSelectedFile.name;
        payload.fileDataUrl = fileDataUrl;
      }

      const res = await fetch(`/api/employee-documents/${doc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(data?.error ?? "Erreur lors de la modification du document"));
        setIsEditingBusy(false);
        return;
      }

      toast.success("Document modifié avec succès.");
      setEditingId(null);
      setEditSelectedFile(null);
      await loadDocuments({ pageNumber: 0, append: false });
      await refreshUploadOwnerDocuments();
      setIsEditingBusy(false);
    } catch {
      toast.error("Erreur réseau lors de la modification.");
      setIsEditingBusy(false);
    }
  };

  const deleteDocument = async (doc: EmployeeDocument) => {
    setDeleteModalDoc(doc);
  };

  const openDocument = async (doc: EmployeeDocument) => {
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
      setOpeningDocId(null);
    } catch {
      toast.error("Erreur réseau lors de l'ouverture du document");
      setOpeningDocId(null);
    }
  };

  const confirmDeleteDocument = async () => {
    if (!deleteModalDoc) return;
    const token = getToken();
    if (!token) return;

    setIsEditingBusy(true);
    try {
      const res = await fetch(`/api/employee-documents/${deleteModalDoc.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(String(data?.error ?? "Erreur lors de la suppression du document"));
        setIsEditingBusy(false);
        return;
      }
      toast.success("Document supprimé.");
      if (editingId === deleteModalDoc.id) setEditingId(null);
      setDeleteModalDoc(null);
      await loadDocuments({ pageNumber: 0, append: false });
      await refreshUploadOwnerDocuments();
      setIsEditingBusy(false);
    } catch {
      toast.error("Erreur réseau lors de la suppression.");
      setIsEditingBusy(false);
    }
  };

  const getEditTypeOptions = (doc: EmployeeDocument) => {
    const occupied = new Set(
      documents
        .filter(
          (item) =>
            item.employeeId === doc.employeeId &&
            item.id !== doc.id &&
            item.type !== "CHILD_BIRTH_CERTIFICATE"
        )
        .map((item) => item.type)
    );
    return documentTypes.filter((item) => {
      if (item.value === "SPOUSE_BIRTH_CERTIFICATE" && !isMarried && doc.type !== "SPOUSE_BIRTH_CERTIFICATE") {
        return false;
      }
      return item.value === "CHILD_BIRTH_CERTIFICATE" || item.value === doc.type || !occupied.has(item.value);
    });
  };

  const documentsByCategory = useMemo(() => {
    const grouped = new Map<DocumentType, EmployeeDocument[]>();
    for (const item of documentTypes) grouped.set(item.value, []);
    for (const doc of documents) {
      const bucket = grouped.get(doc.type);
      if (bucket) bucket.push(doc);
    }
    for (const bucket of grouped.values()) {
      bucket.sort((a, b) => {
        const at = new Date(a.createdAt).getTime();
        const bt = new Date(b.createdAt).getTime();
        return bt - at;
      });
    }
    return documentTypes
      .map((item) => ({ type: item.value, label: item.label, documents: grouped.get(item.value) ?? [] }))
      .filter((group) => group.documents.length > 0);
  }, [documents, documentTypes]);

  const toggleCollapse = (type: DocumentType) => {
    setCollapsedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const visibleDocumentGroups = useMemo(() => {
    if (viewTypeFilter === "ALL") return documentsByCategory;
    return documentsByCategory.filter((group) => group.type === viewTypeFilter);
  }, [documentsByCategory, viewTypeFilter]);

  return (
    <div className="bg-white border border-vdm-gold-200 rounded-xl p-6 mt-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="text-lg font-semibold text-vdm-gold-800">Documents RH</div>
          <div className="text-sm text-vdm-gold-700">
            {isEmployeesScope
              ? "Consultez et gérez les documents administratifs des employés."
              : "Ajoutez et consultez vos documents administratifs (CNI, extraits, CV, lettre, localisation géographique)."}
          </div>
          {!canUploadDocuments ? (
            <div className="text-xs text-vdm-gold-700 mt-1">
              {employee.role === "CEO"
                ? "Mode lecture seule : vous pouvez consulter et télécharger les documents de tous les employés."
                : "Les documents personnels de la comptable sont gérés sur la page Profil."}
            </div>
          ) : hasGlobalAccess ? (
            <div className="text-xs text-vdm-gold-700 mt-1">
              Vous pouvez consulter tous les documents, mais vous ne pouvez ajouter que vos propres documents.
            </div>
          ) : null}
        </div>
      </div>

      <div className="mb-4">
        <div className="text-xs text-vdm-gold-600 mb-1">Filtrer par type</div>
        <select
          value={viewTypeFilter}
          onChange={(e) => setViewTypeFilter(e.target.value as DocumentType | "ALL")}
          className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
        >
          <option value="ALL">Tous les types</option>
          {documentTypes.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className={`${filtersGridClass} mb-4`}>
        {hasGlobalAccess ? (
          <div className={employeeFilterWrapperClass}>
            <div>
              <div className="text-xs text-vdm-gold-600 mb-1">Afficher les documents de</div>
              <select
                value={selectedEmployeeId}
                onChange={(e) => {
                  setSelectedEmployeeId(e.target.value);
                }}
                className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
              >
                <option value={ALL_EMPLOYEES_VALUE}>{allEmployeesLabel}</option>
                {employee.role !== "CEO" && !isEmployeesScope ? (
                  <option value={employee.id}>
                    {employee.firstName} {employee.lastName} (moi)
                  </option>
                ) : null}
                {employees
                  .filter((item) => item.id !== employee.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {employeeLabel(item)}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        ) : null}

        {canUploadDocuments ? (
          <>
            <div>
              <div className="text-xs text-vdm-gold-600 mb-1">Type de document</div>
              <select
                value={effectiveSelectedType}
                onChange={(e) => setSelectedType(e.target.value as DocumentType)}
                className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
              >
                {availableUploadTypes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            {needsRelatedName ? (
              <div>
                <div className="text-xs text-vdm-gold-600 mb-1">{isChildType ? "Nom de l'enfant" : "Nom du conjoint"}</div>
                <input
                  value={relatedPersonName}
                  onChange={(e) => setRelatedPersonName(e.target.value)}
                  placeholder={isChildType ? "Ex: KOUAME Sara" : "Ex: YAO Marie"}
                  className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                />
              </div>
            ) : null}

            {isChildType ? (
              <div>
                <div className="text-xs text-vdm-gold-600 mb-1">Rang de l&apos;enfant (facultatif)</div>
                <input
                  value={childOrder}
                  onChange={(e) => setChildOrder(e.target.value.replace(/\D/g, ""))}
                  placeholder="1"
                  inputMode="numeric"
                  className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                />
              </div>
            ) : null}
            {needsValidityDate ? (
              <div>
                <div className="text-xs text-vdm-gold-600 mb-1">Date de validité</div>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                />
              </div>
            ) : null}

            <div className={needsRelatedName || isChildType ? "md:col-span-3" : "md:col-span-2"}>
              <div className="text-xs text-vdm-gold-600 mb-1">Fichier (PDF ou image)</div>
              <input
                key={fileInputKey}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500 bg-white"
              />
            </div>
          </>
        ) : null}
      </div>

      {canUploadDocuments ? (
        <div className="mb-4">
          <button
            type="button"
            onClick={uploadDocument}
            disabled={isUploadButtonDisabled}
            className="px-3 py-2 rounded-md bg-vdm-gold-700 text-white text-sm hover:bg-vdm-gold-800 disabled:opacity-60"
          >
            {isUploading ? "Envoi..." : "Ajouter le document"}
          </button>
          {availableUploadTypes.length === 0 ? (
            <div className="text-xs text-vdm-gold-700 mt-1">
              Tous les documents à exemplaire unique sont déjà ajoutés. Seuls les extraits d&apos;enfant peuvent être
              multiples.
            </div>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <div className="text-sm text-vdm-gold-700">Chargement des documents...</div>
      ) : documents.length === 0 ? (
        <div className="text-sm text-vdm-gold-700">Aucun document pour le moment.</div>
      ) : (
        <div className="space-y-4">
          {visibleDocumentGroups.map((group) => {
            const isCollapsed = collapsedTypes.has(group.type);
            return (
              <div key={group.type} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-vdm-gold-800">{group.label}</div>
                    <div className="text-xs text-vdm-gold-600">
                      {group.documents.length} document{group.documents.length > 1 ? "s" : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleCollapse(group.type)}
                    className="text-xs text-vdm-gold-600 hover:text-vdm-gold-900 focus:outline-none"
                    aria-expanded={!isCollapsed}
                  >
                    {isCollapsed ? "Afficher" : "Masquer"}
                  </button>
                </div>
                {isCollapsed ? (
                  <div className="text-xs text-vdm-gold-500">Section repliée. Cliquez sur "Afficher".</div>
                ) : (
                  group.documents.map((doc) => (
                    <div key={doc.id} className="border border-vdm-gold-200 rounded-md p-3">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div className="flex items-start gap-3">
                          {doc.employee?.profilePhotoUrl ? (
                            <button
                              type="button"
                              onClick={() => {
                                setPhotoPreviewUrl(doc.employee?.profilePhotoUrl ?? null);
                                setPhotoPreviewLabel(`Photo de ${employeeLabel(doc.employee)}`);
                              }}
                              className="rounded-full focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                              aria-label={`Agrandir la photo de ${employeeLabel(doc.employee)}`}
                            >
                              <img
                                src={doc.employee.profilePhotoUrl}
                                alt={`Photo de ${employeeLabel(doc.employee)}`}
                                className="h-10 w-10 rounded-full object-cover border border-vdm-gold-200 cursor-zoom-in"
                              />
                            </button>
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-vdm-gold-100 text-vdm-gold-800 border border-vdm-gold-200 flex items-center justify-center text-xs font-semibold">
                              {(doc.employee?.firstName?.[0] ?? "").toUpperCase()}
                              {(doc.employee?.lastName?.[0] ?? "").toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-semibold text-vdm-gold-900">{typeLabel(doc.type, documentTypes)}</div>
                            <div className="text-xs text-vdm-gold-700">
                              Fichier: {doc.fileName} | Ajouté le: {formatDate(doc.createdAt)}
                            </div>
                            {doc.relatedPersonName ? (
                              <div className="text-xs text-vdm-gold-700">
                                {doc.type === "CHILD_BIRTH_CERTIFICATE" ? "Enfant" : "Conjoint"}: {doc.relatedPersonName}
                                {doc.type === "CHILD_BIRTH_CERTIFICATE" && doc.childOrder
                                  ? ` (rang ${doc.childOrder})`
                                  : ""}
                              </div>
                            ) : null}
                            {doc.validUntil ? (
                              <div className="text-xs text-vdm-gold-700">
                                Valide jusqu&apos;au {formatValidityDate(doc.validUntil)}
                              </div>
                            ) : null}
                            {hasGlobalAccess ? (
                              <div className="text-xs text-vdm-gold-700">
                                Employé: {employeeLabel(doc.employee)} | Déposé par: {doc.uploadedBy?.firstName} {doc.uploadedBy?.lastName}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openDocument(doc)}
                            disabled={openingDocId === doc.id}
                            className="px-3 py-2 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50"
                          >
                            {openingDocId === doc.id ? "Ouverture..." : "Ouvrir / Télécharger"}
                          </button>
                          {canManageDocument(doc) ? (
                            <>
                              <button
                                type="button"
                                onClick={() => startEditDocument(doc)}
                                className="px-3 py-2 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50"
                                disabled={isEditingBusy}
                              >
                                Modifier
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteDocument(doc)}
                                className="px-3 py-2 rounded-md border border-red-300 text-red-700 text-sm hover:bg-red-50"
                                disabled={isEditingBusy}
                              >
                                Supprimer
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>

                      {editingId === doc.id ? (
                        <div className="mt-3 border-t border-vdm-gold-100 pt-3 space-y-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <div className="text-xs text-vdm-gold-600 mb-1">Type de document</div>
                              <select
                                value={editType}
                                onChange={(e) => setEditType(e.target.value as DocumentType)}
                                className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                                disabled={isEditingBusy}
                              >
                                {getEditTypeOptions(doc).map((item) => (
                                  <option key={item.value} value={item.value}>
                                    {item.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {isEditingNeedsRelatedName ? (
                              <div>
                                <div className="text-xs text-vdm-gold-600 mb-1">{isEditingChildType ? "Nom de l'enfant" : "Nom du conjoint"}</div>
                                <input
                                  value={editRelatedPersonName}
                                  onChange={(e) => setEditRelatedPersonName(e.target.value)}
                                  className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                                  disabled={isEditingBusy}
                                />
                              </div>
                            ) : null}

                            {isEditingChildType ? (
                              <div>
                                <div className="text-xs text-vdm-gold-600 mb-1">Rang de l'enfant (facultatif)</div>
                                <input
                                  value={editChildOrder}
                                  onChange={(e) => setEditChildOrder(e.target.value.replace(/\D/g, ""))}
                                  className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                                  disabled={isEditingBusy}
                                />
                              </div>
                            ) : null}
                            {isEditingNeedsValidityDate ? (
                              <div>
                                <div className="text-xs text-vdm-gold-600 mb-1">Date de validité</div>
                                <input
                                  type="date"
                                  value={editValidUntil}
                                  onChange={(e) => setEditValidUntil(e.target.value)}
                                  className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                                  disabled={isEditingBusy}
                                />
                              </div>
                            ) : null}
                          </div>

                          <div>
                            <div className="text-xs text-vdm-gold-600 mb-1">Remplacer le fichier (optionnel)</div>
                            <input
                              key={editFileInputKey}
                              type="file"
                              accept="application/pdf,image/jpeg,image/png,image/webp"
                              onChange={(e) => setEditSelectedFile(e.target.files?.[0] ?? null)}
                              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500 bg-white"
                              disabled={isEditingBusy}
                            />
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveEditDocument(doc)}
                              className="px-3 py-2 rounded-md bg-vdm-gold-700 text-white text-sm hover:bg-vdm-gold-800 disabled:opacity-60"
                              disabled={isEditingBusy}
                            >
                              {isEditingBusy ? "Enregistrement..." : "Enregistrer"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditDocument}
                              className="px-3 py-2 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50"
                              disabled={isEditingBusy}
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
      {photoPreviewUrl ? (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPhotoPreviewUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Aperçu de la photo de profil"
        >
          <div
            className="relative w-full max-w-3xl rounded-xl overflow-hidden bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPhotoPreviewUrl(null)}
              className="absolute right-3 top-3 rounded-md bg-white/90 px-2 py-1 text-xs text-vdm-gold-900 border border-vdm-gold-200 hover:bg-white"
            >
              Fermer
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreviewUrl} alt={photoPreviewLabel} className="w-full max-h-[85vh] object-contain bg-black" />
          </div>
        </div>
      ) : null}

      {deleteModalDoc ? (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl bg-white border border-vdm-gold-200 p-5">
            <div className="text-base font-semibold text-vdm-gold-900 mb-2">Confirmer la suppression</div>
            <div className="text-sm text-vdm-gold-700 mb-4">
              Voulez-vous vraiment supprimer ce document :{" "}
              <span className="font-semibold">{deleteModalDoc.fileName}</span> ?
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteModalDoc(null)}
                className="px-3 py-2 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50"
                disabled={isEditingBusy}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmDeleteDocument}
                className="px-3 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60"
                disabled={isEditingBusy}
              >
                {isEditingBusy ? "Suppression..." : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
