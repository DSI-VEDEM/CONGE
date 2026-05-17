"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { getEmployee, getToken } from "@/lib/auth-client";
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import { adjacencyGraphs, dictionary as commonDictionary } from "@zxcvbn-ts/language-common";
import { dictionary as frDictionary } from "@zxcvbn-ts/language-fr";
import EmployeeDocumentsSection from "@/app/components/EmployeeDocumentsSection";
import type { DocumentTypeItem } from "@/lib/document-types";
import { formatDateDMY } from "@/lib/date-format";
import {
  calculatePersonalProfileCompletion,
  completionPercent,
  type ProfileDocumentCompletionSummary,
} from "@/lib/profile-completion";
import { MARITAL_STATUS_LABELS, MARITAL_STATUSES, isMaritalStatus } from "@/lib/marital-status";
import {
  PROFILE_PHOTO_TOO_LARGE_MESSAGE,
  isProfilePhotoDataUrlTooLarge,
  profilePhotoFileError,
  profilePhotoSaveErrorMessage,
} from "@/lib/profile-photo";
import {
  firstProfileValidationError,
  isProfileField,
  validateProfileUpdateInput,
  type ProfileField,
  type ProfileValidationErrors,
} from "@/lib/profile-validation";

zxcvbnOptions.setOptions({
  graphs: adjacencyGraphs,
  dictionary: {
    ...commonDictionary,
    ...frDictionary,
  },
});

type EditableEmployee = ReturnType<typeof getEmployee> & {
  jobTitle?: string | null;
};
type DepartmentListResponse = {
  departments?: Array<{ id: string; name?: string; type?: string }>;
};
type ServiceListResponse = {
  services?: Array<{ id: string; name?: string; type?: string }>;
};
function parsePhone(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (raw.startsWith("+ ")) {
    const local = raw.slice(2).replace(/\D/g, "").slice(0, 12);
    return { country: "", local };
  }
  if (raw.startsWith("+")) {
    const body = raw.slice(1);
    const sep = body.indexOf(" ");
    if (sep === -1) {
      const country = body.replace(/\D/g, "").slice(0, 3);
      return { country, local: "" };
    }
    const country = body.slice(0, sep).replace(/\D/g, "").slice(0, 3);
    const local = body
      .slice(sep + 1)
      .replace(/\D/g, "")
      .slice(0, 12);
    return { country, local };
  }
  if (raw.startsWith("00")) {
    const body = raw.slice(2);
    const country = body.replace(/\D/g, "").slice(0, 3);
    const local = body.slice(country.length).replace(/\D/g, "").slice(0, 12);
    return { country, local };
  }
  return { country: "225", local: raw.replace(/\D/g, "").slice(0, 12) };
}

function formatLocalPhone(local: string) {
  const pairs = local.match(/.{1,2}/g);
  return pairs ? pairs.join(" ") : "";
}

function composePhone(country: string, local: string) {
  const c = country.replace(/\D/g, "").slice(0, 3);
  const l = local.replace(/\D/g, "").slice(0, 12);
  const formattedLocal = formatLocalPhone(l);
  if (!c) return formattedLocal ? `+ ${formattedLocal}` : "+";
  return formattedLocal ? `+${c} ${formattedLocal}` : `+${c}`;
}

function toDateInputValue(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function currentHireDateValue(draft: EditableEmployee) {
  const raw = draft.companyEntryDate ?? draft.hireDate ?? null;
  if (!raw) return null;
  const normalized = toDateInputValue(raw);
  return normalized ? normalized : null;
}

function roleLabel(role?: string | null) {
  if (!role) return "—";
  if (role === "DEPT_HEAD") return "Directeur de Département";
  if (role === "SERVICE_HEAD") return "Directeur Adjoint";
  if (role === "ACCOUNTANT") return "Comptable";
  if (role === "CEO") return "PDG";
  if (role === "EMPLOYEE") return "Employé";
  return role;
}

type ProfileViewProps = {
  documentTypes?: readonly DocumentTypeItem[];
};

export default function ProfileView({ documentTypes }: ProfileViewProps) {
  const employee = useMemo(() => getEmployee() as EditableEmployee | null, []);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<EditableEmployee | null>(employee);
  const [isPhotoPreviewOpen, setIsPhotoPreviewOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ProfileValidationErrors>({});
  const [departmentNames, setDepartmentNames] = useState<Record<string, string>>({});
  const [serviceNames, setServiceNames] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [documentCompletion, setDocumentCompletion] = useState<ProfileDocumentCompletionSummary | null>(null);

  const profileDocumentTypes = useMemo(() => {
    if (!documentTypes) return documentTypes;
    const isMarried = draft?.maritalStatus === "MARRIED";
    const hasChildren = typeof draft?.childrenCount === "number" && draft.childrenCount > 0;
    return documentTypes.filter((item) => {
      if (!isMarried && item.value === "SPOUSE_BIRTH_CERTIFICATE") return false;
      if (!hasChildren && item.value === "CHILD_BIRTH_CERTIFICATE") return false;
      return true;
    });
  }, [documentTypes, draft?.maritalStatus, draft?.childrenCount]);

  const pw = useMemo(() => {
    const userInputs = [draft?.email, draft?.firstName, draft?.lastName].filter(Boolean);
    return zxcvbn(password, userInputs as string[]);
  }, [password, draft?.email, draft?.firstName, draft?.lastName]);

  const personalCompletion = useMemo(
    () => (draft ? calculatePersonalProfileCompletion(draft) : { completed: 0, total: 0, missingLabels: [] }),
    [draft]
  );
  const profileCompletion = useMemo(() => {
    const documents =
      draft?.role === "CEO"
        ? { completed: 0, total: 0, missingLabels: [], isLoaded: true }
        : documentCompletion;
    const completed = personalCompletion.completed + (documents?.completed ?? 0);
    const total = personalCompletion.total + (documents?.total ?? 0);
    return {
      completed,
      total,
      missingLabels: [...personalCompletion.missingLabels, ...(documents?.missingLabels ?? [])],
      isLoaded: draft?.role === "CEO" || Boolean(documents?.isLoaded),
    };
  }, [documentCompletion, draft?.role, personalCompletion]);
  const profileCompletionPercentage = completionPercent(profileCompletion);

  useEffect(() => {
    const token = getToken();
    if (!token || !employee?.id) return;
    const load = async () => {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.employee) {
        const refreshed = { ...employee, ...data.employee };
        localStorage.setItem("employee", JSON.stringify(refreshed));
        setDraft(refreshed);
      }
    };
    load();
  }, [employee]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const loadOrganizationNames = async () => {
      const [departmentsRes, servicesRes] = await Promise.all([
        fetch("/api/departments", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/services", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const departmentsData = (await departmentsRes.json().catch(() => ({}))) as DepartmentListResponse;
      if (departmentsRes.ok) {
        const map: Record<string, string> = {};
        (departmentsData?.departments ?? []).forEach((department) => {
          map[department.id] = department.name ?? department.type ?? department.id;
        });
        setDepartmentNames(map);
      }

      const servicesData = (await servicesRes.json().catch(() => ({}))) as ServiceListResponse;
      if (servicesRes.ok) {
        const map: Record<string, string> = {};
        (servicesData?.services ?? []).forEach((service) => {
          map[service.id] = service.name ?? service.type ?? service.id;
        });
        setServiceNames(map);
      }
    };
    loadOrganizationNames();
  }, []);

  useEffect(() => {
    if (!isPhotoPreviewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsPhotoPreviewOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPhotoPreviewOpen]);

  const hasChanges = useMemo(() => {
    const stringEq = (a: string | null | undefined, b: string | null | undefined) => (a ?? "") === (b ?? "");
    const numberEq = (a: number | null | undefined, b: number | null | undefined) =>
      String(a ?? "") === String(b ?? "");
    if (!employee || !draft) return false;
    return (
      !stringEq(employee.firstName, draft.firstName) ||
      !stringEq(employee.lastName, draft.lastName) ||
      !stringEq(employee.jobTitle, draft.jobTitle) ||
      !stringEq(employee.phone, draft.phone) ||
      !stringEq(employee.profilePhotoUrl, draft.profilePhotoUrl) ||
      !stringEq(employee.fullAddress, draft.fullAddress) ||
      !stringEq(employee.cnpsNumber, draft.cnpsNumber) ||
      !stringEq(employee.maritalStatus, draft.maritalStatus) ||
      !numberEq(employee.childrenCount, draft.childrenCount)
    );
  }, [employee, draft]);
  const isSaveDisabled = isSaving || (!hasChanges && !password);

  const setFieldError = (field: ProfileField, message: string | null) => {
    setFieldErrors((current) => {
      if (!message && !current[field]) return current;
      const next = { ...current };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
  };

  const clearFieldError = (field: ProfileField) => setFieldError(field, null);

  useEffect(() => {
    if (!isEditing) return;
    console.info("Profile edit modal visible", { employeeId: employee?.id ?? "unknown" });
  }, [isEditing, employee?.id]);

  const openEditModal = () => {
    console.info("Opening profile edit modal", { employeeId: employee?.id ?? "unknown" });
    setShowPassword(false);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    console.info("Profile edit modal cancelled", { employeeId: employee?.id ?? "unknown" });
    setDraft(employee);
    setPassword("");
    setShowPassword(false);
    setPasswordError(null);
    setPhotoError(null);
    setFieldErrors({});
    setIsEditing(false);
  };

  const onProfilePhotoChange = (file: File | null) => {
    if (!file) return;
    const fileError = profilePhotoFileError(file);
    if (fileError) {
      setPhotoError(fileError);
      setFieldError("profilePhotoUrl", fileError);
      toast.error(fileError);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result.startsWith("data:image/")) {
        const message = "Format d'image invalide.";
        setPhotoError(message);
        setFieldError("profilePhotoUrl", message);
        return;
      }
      if (isProfilePhotoDataUrlTooLarge(result)) {
        setPhotoError(PROFILE_PHOTO_TOO_LARGE_MESSAGE);
        setFieldError("profilePhotoUrl", PROFILE_PHOTO_TOO_LARGE_MESSAGE);
        toast.error(PROFILE_PHOTO_TOO_LARGE_MESSAGE);
        return;
      }
      setPhotoError(null);
      clearFieldError("profilePhotoUrl");
      setDraft((prev) => (prev ? { ...prev, profilePhotoUrl: result } : prev));
    };
    reader.onerror = () => setPhotoError("Erreur lors du chargement de l'image.");
    reader.readAsDataURL(file);
  };

  const downloadPassportPhoto = async () => {
    const currentDraft = draft;
    if (!currentDraft?.profilePhotoUrl) return;
    try {
      const response = await fetch(currentDraft.profilePhotoUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Impossible de charger l'image"));
        img.src = objectUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = 413;
      canvas.height = 531;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponible");

      const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const dx = (canvas.width - drawWidth) / 2;
      const dy = (canvas.height - drawHeight) / 2;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, dx, dy, drawWidth, drawHeight);

      const jpgDataUrl = canvas.toDataURL("image/jpeg", 0.95);
      const safeName = `${currentDraft.firstName ?? ""}-${currentDraft.lastName ?? ""}`
        .replace(/\s+/g, "-")
        .toLowerCase();
      const a = document.createElement("a");
      a.href = jpgDataUrl;
      a.download = `photo-passeport-${safeName || "profil"}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(objectUrl);
    } catch {
      setPhotoError("Impossible de télécharger la photo au format passeport.");
    }
  };

  const saveEdit = async () => {
    if (!draft) {
      toast.error("Profil indisponible.");
      return;
    }
    const errors = validateProfileUpdateInput({ ...draft, password });
    if (password && !errors.password && pw.score < 2) {
      errors.password = "Mot de passe trop faible. Renforcez-le avant de continuer.";
    }
    const firstError = firstProfileValidationError(errors);
    if (firstError) {
      setFieldErrors(errors);
      setPasswordError(errors.password ?? null);
      if (errors.profilePhotoUrl) setPhotoError(errors.profilePhotoUrl);
      toast.error(firstError);
      return;
    }
    setPasswordError(null);
    setPhotoError(null);
    setFieldErrors({});
    if (!hasChanges && !password) {
      toast("Aucune modification détectée.", { icon: "ℹ️" });
      return;
    }
    const token = getToken();
    if (!token) return;

    const payload: Record<string, unknown> = {
      firstName: draft.firstName,
      lastName: draft.lastName,
      jobTitle: draft.jobTitle ?? null,
      phone: draft.phone ?? null,
      profilePhotoUrl: draft.profilePhotoUrl ?? null,
      fullAddress: draft.fullAddress ?? null,
      cnpsNumber: draft.cnpsNumber ?? null,
      maritalStatus: draft.maritalStatus ?? null,
      childrenCount: draft.childrenCount ?? null,
    };
    if (password) payload.password = password;

    console.info("Saving profile changes", {
      employeeId: employee?.id ?? "unknown",
      fields: Object.keys(payload).filter((key) => payload[key] != null),
    });
    const toastId = toast.loading("Modification en cours...");
    setIsSaving(true);
    try {
      const res = await fetch(`/api/auth/me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMessage = profilePhotoSaveErrorMessage(
          res.status,
          data?.error,
          "Impossible de mettre à jour le profil."
        );
        toast.error(errorMessage, { id: toastId });
        if (isProfileField(data?.field)) {
          setFieldError(data.field, errorMessage);
        }
        if (data?.field === "profilePhotoUrl" || errorMessage.toLowerCase().includes("photo")) {
          setPhotoError(errorMessage);
        } else if (data?.field === "password" || !isProfileField(data?.field)) {
          setPasswordError(errorMessage);
        }
        return;
      }

      toast.success("Profil mis à jour.", { id: toastId });
      const updated = data?.employee ? { ...draft, ...data.employee } : { ...draft };
      localStorage.setItem("employee", JSON.stringify(updated));
      setPassword("");
      setShowPassword(false);
      setIsEditing(false);
    } catch (saveError) {
      console.error("Échec mise à jour profil", saveError);
      const message = draft.profilePhotoUrl
        ? "Envoi impossible. La photo est peut-être trop volumineuse, essayez une image plus légère."
        : "Erreur réseau lors de l'envoi.";
      if (draft.profilePhotoUrl) {
        setPhotoError(message);
        setFieldError("profilePhotoUrl", message);
      }
      toast.error(message, { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  if (!employee || !draft) {
    return (
      <div className="bg-white border border-vdm-gold-200 rounded-xl p-4">
        <div className="text-sm text-vdm-gold-700">Aucune session trouvée.</div>
      </div>
    );
  }

  const phone = parsePhone(draft.phone);
  const missingPreview = profileCompletion.missingLabels.slice(0, 6);
  const hiddenMissingCount = Math.max(0, profileCompletion.missingLabels.length - missingPreview.length);

  return (
    <div>
      <div className="bg-white border border-vdm-gold-200 rounded-xl p-6 mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-semibold text-vdm-gold-800">Complétude du profil</div>
            <div className="text-sm text-vdm-gold-700">
              {profileCompletion.isLoaded
                ? `${profileCompletion.completed}/${profileCompletion.total} éléments complétés`
                : "Vérification des documents en cours..."}
            </div>
          </div>
          <div className="text-2xl font-semibold text-vdm-gold-900">{profileCompletionPercentage}%</div>
        </div>
        <div
          className="mt-4 h-3 w-full overflow-hidden rounded-full bg-vdm-gold-100"
          role="progressbar"
          aria-label="Complétude du profil"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={profileCompletionPercentage}
        >
          <div
            className="h-full rounded-full bg-vdm-gold-700 transition-all"
            style={{ width: `${profileCompletionPercentage}%` }}
          />
        </div>
        {profileCompletion.isLoaded ? (
          profileCompletion.missingLabels.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {missingPreview.map((label) => (
                <span
                  key={label}
                  className="rounded-md border border-vdm-gold-200 bg-vdm-gold-50 px-2 py-1 text-xs text-vdm-gold-800"
                >
                  {label}
                </span>
              ))}
              {hiddenMissingCount > 0 ? (
                <span className="rounded-md border border-vdm-gold-200 bg-vdm-gold-50 px-2 py-1 text-xs text-vdm-gold-800">
                  +{hiddenMissingCount} autre{hiddenMissingCount > 1 ? "s" : ""}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 text-sm font-medium text-green-700">Profil complet.</div>
          )
        ) : null}
      </div>
      <div className="bg-white border border-vdm-gold-200 rounded-xl p-6">
        <div className="flex items-center gap-4 mb-5 pb-4 border-b border-vdm-gold-100">
          {draft.profilePhotoUrl ? (
            <button
              type="button"
              onClick={() => setIsPhotoPreviewOpen(true)}
              className="rounded-full focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
              aria-label="Agrandir la photo de profil"
            >
              <Image
                src={draft.profilePhotoUrl}
                alt="Photo de profil"
                width={64}
                height={64}
                className="h-16 w-16 rounded-full object-cover border border-vdm-gold-200 cursor-zoom-in"
              />
            </button>
          ) : (
            <div className="h-16 w-16 rounded-full bg-vdm-gold-100 text-vdm-gold-800 border border-vdm-gold-200 flex items-center justify-center font-semibold">
              {(draft.firstName?.[0] ?? "").toUpperCase()}
              {(draft.lastName?.[0] ?? "").toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <div className="text-sm font-semibold text-vdm-gold-900">Photo de profil</div>
            <div className="text-xs text-vdm-gold-700">
              {draft.fullAddress && draft.phone
                ? "Profil complet."
                : "Adresse précise et numéro de téléphone obligatoires. Photo facultative."}
            </div>
            {fieldErrors.profilePhotoUrl || photoError ? (
              <div className="text-xs text-red-600 mt-1">{fieldErrors.profilePhotoUrl ?? photoError}</div>
            ) : null}
          </div>
          {draft.profilePhotoUrl ? (
            <div>
              <button
                type="button"
                onClick={downloadPassportPhoto}
                className="px-3 py-2 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50"
              >
                Télécharger la photo
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-lg font-semibold text-vdm-gold-800">Informations du compte</div>
            <div className="text-sm text-vdm-gold-700">Mise à jour des informations personnelles.</div>
          </div>
          <button
            onClick={openEditModal}
            className="px-3 py-2 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50"
          >
            Modifier
          </button>
        </div>

        {isPhotoPreviewOpen && draft.profilePhotoUrl ? (
          <div
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setIsPhotoPreviewOpen(false)}
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
                onClick={() => setIsPhotoPreviewOpen(false)}
                className="absolute right-3 top-3 rounded-md bg-white/90 px-2 py-1 text-xs text-vdm-gold-900 border border-vdm-gold-200 hover:bg-white"
              >
                Fermer
              </button>
              <Image
                src={draft.profilePhotoUrl}
                alt="Aperçu agrandi de la photo de profil"
                width={900}
                height={900}
                className="w-full max-h-[85vh] object-contain bg-black"
                priority
              />
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs text-vdm-gold-600">Prénom</div>
            <div className="text-sm text-vdm-gold-900 font-medium">{draft.firstName ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600">Nom</div>
            <div className="text-sm text-vdm-gold-900 font-medium">{draft.lastName ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600">Email</div>
            <div className="text-sm text-vdm-gold-900 font-medium">{draft.email}</div>
          </div>
          <div className="md:col-span-2">
            <div className="text-xs text-vdm-gold-600">Photo de profil (upload d’image)</div>
            <div className="text-sm text-vdm-gold-900 font-medium">
              {draft.profilePhotoUrl ? "Photo chargée" : "—"}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-xs text-vdm-gold-600">Adresse précise</div>
            <div className="text-sm text-vdm-gold-900 font-medium">{draft.fullAddress ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600">Matricule</div>
            <div className="text-sm text-vdm-gold-900 font-medium">{draft.matricule ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600">Poste</div>
            <div className="text-sm text-vdm-gold-900 font-medium">{draft.jobTitle ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600">Téléphone</div>
            <div className="text-sm text-vdm-gold-900 font-medium">{draft.phone ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600">Rôle</div>
            <div className="text-sm text-vdm-gold-900 font-medium">{roleLabel(draft.role)}</div>
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600">Statut</div>
            <div className="text-sm text-vdm-gold-900 font-medium">{draft.status}</div>
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600">Département</div>
            <div className="text-sm text-vdm-gold-900 font-medium">
              {draft.departmentId ? (departmentNames[draft.departmentId] ?? draft.departmentId) : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600">Service</div>
            <div className="text-sm text-vdm-gold-900 font-medium">
              {draft.serviceId ? (serviceNames[draft.serviceId] ?? draft.serviceId) : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600">Date d&apos;entrée dans l&apos;entreprise</div>
            <div className="text-sm text-vdm-gold-900 font-medium">
              {formatDateDMY(currentHireDateValue(draft))}
            </div>
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600">Numéro CNPS</div>
            <div className="text-sm text-vdm-gold-900 font-medium">{draft.cnpsNumber ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600">Situation matrimoniale</div>
            <div className="text-sm text-vdm-gold-900 font-medium">
              {draft.maritalStatus ? MARITAL_STATUS_LABELS[draft.maritalStatus] : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600">Nombre d'enfants</div>
            <div className="text-sm text-vdm-gold-900 font-medium">
              {typeof draft.childrenCount === "number" ? draft.childrenCount : "—"}
            </div>
          </div>
        </div>
      </div>
      {draft.role !== "CEO" ? (
        <EmployeeDocumentsSection
          employee={draft}
          scope={employee.role === "ACCOUNTANT" ? "self" : "default"}
          documentTypes={profileDocumentTypes}
          onCompletionChange={setDocumentCompletion}
        />
      ) : null}
      {isEditing ? (
        <div
          className="fixed inset-0 z-50 overflow-auto bg-black/40 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-label="Modifier les informations de profil"
        >
          <div className="mx-auto w-full max-w-5xl rounded-2xl border border-vdm-gold-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-vdm-gold-100 px-6 py-4">
              <div>
                <div className="text-lg font-semibold text-vdm-gold-800">Modifier les informations</div>
                <div className="text-sm text-vdm-gold-600">Mettez à jour vos informations personnelles.</div>
              </div>
              <button
                type="button"
                onClick={cancelEdit}
                className="text-sm text-vdm-gold-600 hover:text-vdm-gold-900"
              >
                Fermer
              </button>
            </div>
            <div className="space-y-6 px-6 py-6">
              <div className="flex items-center gap-4 border-b border-vdm-gold-100 pb-4">
                {draft.profilePhotoUrl ? (
                  <button
                    type="button"
                    onClick={() => setIsPhotoPreviewOpen(true)}
                    className="rounded-full focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                    aria-label="Agrandir la photo de profil"
                  >
                    <Image
                      src={draft.profilePhotoUrl}
                      alt="Photo de profil"
                      width={64}
                      height={64}
                      className="h-16 w-16 rounded-full object-cover border border-vdm-gold-200 cursor-zoom-in"
                    />
                  </button>
                ) : (
                  <div className="h-16 w-16 rounded-full bg-vdm-gold-100 text-vdm-gold-800 border border-vdm-gold-200 flex items-center justify-center font-semibold">
                    {(draft.firstName?.[0] ?? "").toUpperCase()}
                    {(draft.lastName?.[0] ?? "").toUpperCase()}
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <div className="text-sm font-semibold text-vdm-gold-900">Photo de profil</div>
                  <div className="text-xs text-vdm-gold-700">
                    {draft.fullAddress && draft.phone
                      ? "Profil complet."
                      : "Adresse précise et numéro de téléphone obligatoires. Photo facultative."}
                  </div>
                  <div className="space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => onProfilePhotoChange(e.target.files?.[0] ?? null)}
                      className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500 bg-white file:bg-vdm-gold-50 file:text-vdm-gold-800 file:border file:border-vdm-gold-200 file:rounded-md file:px-3 file:py-1 file:mr-3"
                    />
                    {draft.profilePhotoUrl ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={downloadPassportPhoto}
                          className="px-3 py-2 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-xs hover:bg-vdm-gold-50"
                        >
                          Télécharger la photo
                        </button>
                      </div>
                    ) : null}
                    {fieldErrors.profilePhotoUrl || photoError ? (
                      <div className="text-xs text-red-600">{fieldErrors.profilePhotoUrl ?? photoError}</div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs text-vdm-gold-600">Prénom</div>
                  <input
                    value={draft.firstName}
                    onChange={(e) => {
                      clearFieldError("firstName");
                      setDraft({ ...draft, firstName: e.target.value });
                    }}
                    aria-invalid={Boolean(fieldErrors.firstName)}
                    className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                  />
                  {fieldErrors.firstName ? (
                    <div className="mt-1 text-xs text-red-600">{fieldErrors.firstName}</div>
                  ) : null}
                </div>
                <div>
                  <div className="text-xs text-vdm-gold-600">Nom</div>
                  <input
                    value={draft.lastName}
                    onChange={(e) => {
                      clearFieldError("lastName");
                      setDraft({ ...draft, lastName: e.target.value });
                    }}
                    aria-invalid={Boolean(fieldErrors.lastName)}
                    className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                  />
                  {fieldErrors.lastName ? (
                    <div className="mt-1 text-xs text-red-600">{fieldErrors.lastName}</div>
                  ) : null}
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs text-vdm-gold-600">Adresse précise</div>
                  <input
                    value={draft.fullAddress ?? ""}
                    onChange={(e) => {
                      clearFieldError("fullAddress");
                      setDraft({ ...draft, fullAddress: e.target.value });
                    }}
                    aria-invalid={Boolean(fieldErrors.fullAddress)}
                    placeholder="Rue, ville, code postal, pays"
                    className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                  />
                  {fieldErrors.fullAddress ? (
                    <div className="mt-1 text-xs text-red-600">{fieldErrors.fullAddress}</div>
                  ) : null}
                </div>
                <div>
                  <div className="text-xs text-vdm-gold-600">Poste</div>
                  <input
                    value={draft.jobTitle ?? ""}
                    onChange={(e) => {
                      clearFieldError("jobTitle");
                      setDraft({ ...draft, jobTitle: e.target.value });
                    }}
                    className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                  />
                </div>
                <div>
                  <div className="text-xs text-vdm-gold-600">Téléphone</div>
                  <div className="flex gap-2">
                    <div className="w-24">
                      <input
                        value={phone.country ? `+${phone.country}` : "+"}
                        onChange={(e) => {
                          const nextCountry = e.target.value.replace(/\D/g, "").slice(0, 3);
                          clearFieldError("phone");
                          setDraft({ ...draft, phone: composePhone(nextCountry, phone.local) });
                        }}
                        aria-invalid={Boolean(fieldErrors.phone)}
                        placeholder="+225"
                        className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                      />
                    </div>
                    <input
                      value={formatLocalPhone(phone.local)}
                      onChange={(e) => {
                        clearFieldError("phone");
                        setDraft({ ...draft, phone: composePhone(phone.country, e.target.value) });
                      }}
                      aria-invalid={Boolean(fieldErrors.phone)}
                      placeholder="00 00 00 00 00"
                      inputMode="numeric"
                      className="flex-1 border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                    />
                  </div>
                  {fieldErrors.phone ? (
                    <div className="mt-1 text-xs text-red-600">{fieldErrors.phone}</div>
                  ) : null}
                </div>
                <div>
                  <div className="text-xs text-vdm-gold-600">Numéro CNPS</div>
                  <input
                    value={draft.cnpsNumber ?? ""}
                    onChange={(e) => {
                      clearFieldError("cnpsNumber");
                      setDraft({ ...draft, cnpsNumber: e.target.value });
                    }}
                    aria-invalid={Boolean(fieldErrors.cnpsNumber)}
                    className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                    placeholder="Ex : CNPS-123456"
                  />
                  {fieldErrors.cnpsNumber ? (
                    <div className="mt-1 text-xs text-red-600">{fieldErrors.cnpsNumber}</div>
                  ) : null}
                </div>
                <div>
                  <div className="text-xs text-vdm-gold-600">Situation matrimoniale</div>
                  <select
                    value={draft.maritalStatus ?? ""}
                    onChange={(e) => {
                      clearFieldError("maritalStatus");
                      setDraft({
                        ...draft,
                        maritalStatus: isMaritalStatus(e.target.value) ? e.target.value : null,
                      });
                    }}
                    aria-invalid={Boolean(fieldErrors.maritalStatus)}
                    className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500 bg-white"
                  >
                    <option value="">Sélectionner</option>
                    {MARITAL_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {MARITAL_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.maritalStatus ? (
                    <div className="mt-1 text-xs text-red-600">{fieldErrors.maritalStatus}</div>
                  ) : null}
                </div>
                <div>
                  <div className="text-xs text-vdm-gold-600">Nombre d'enfants</div>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={typeof draft.childrenCount === "number" ? String(draft.childrenCount) : ""}
                    onChange={(e) => {
                      const normalized = e.target.value.replace(/\D/g, "");
                      clearFieldError("childrenCount");
                      setDraft({
                        ...draft,
                        childrenCount: normalized === "" ? null : Number(normalized),
                      });
                    }}
                    aria-invalid={Boolean(fieldErrors.childrenCount)}
                    className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                    placeholder="0"
                  />
                  {fieldErrors.childrenCount ? (
                    <div className="mt-1 text-xs text-red-600">{fieldErrors.childrenCount}</div>
                  ) : null}
                </div>
              </div>
              <div>
                <div className="text-xs text-vdm-gold-600">Mot de passe</div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      clearFieldError("password");
                      setPasswordError(null);
                      setPassword(e.target.value);
                    }}
                    aria-invalid={Boolean(fieldErrors.password || passwordError)}
                    placeholder="Nouveau mot de passe"
                    autoComplete="new-password"
                    className="w-full rounded-md border border-vdm-gold-200 p-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-vdm-gold-700 hover:bg-vdm-gold-50 hover:text-vdm-gold-900 focus:outline-none focus:ring-2 focus:ring-vdm-gold-500"
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="mt-2">
                  <div className="h-2 w-full rounded-full bg-vdm-gold-200 overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-vdm-gold-700 transition-all"
                      style={{ width: `${Math.round((Math.min(Math.max(pw.score, 0), 4) / 4) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-600">
                  <span className="font-semibold">
                    {["très faible", "faible", "moyenne", "bonne", "très bonne"][pw.score] ?? "—"}
                  </span>
                </div>
                {fieldErrors.password || passwordError ? (
                  <div className="mt-2 text-xs text-red-600">{fieldErrors.password ?? passwordError}</div>
                ) : null}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-vdm-gold-100 px-6 py-4">
              <button
                type="button"
                onClick={saveEdit}
                disabled={isSaveDisabled}
                className={`px-4 py-2 rounded-md text-white text-sm ${isSaveDisabled ? "bg-vdm-gold-400 cursor-not-allowed" : "bg-vdm-gold-700 hover:bg-vdm-gold-800"}`}
              >
                Enregistrer
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="px-4 py-2 rounded-md border border-vdm-gold-300 text-vdm-gold-800 text-sm hover:bg-vdm-gold-50"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
