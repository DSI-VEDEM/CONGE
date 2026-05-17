"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  getEmployee,
  getToken,
  hasRequiredProfileData,
  routeForRole,
  type EmployeeSession,
} from "@/lib/auth-client";
import {
  EmployeeGender,
  EMPLOYEE_GENDER_LABELS,
  EMPLOYEE_GENDERS,
  isEmployeeGender,
} from "@/lib/employee-gender";
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
  validateOnboardingProfileInput,
  type ProfileField,
  type ProfileValidationErrors,
} from "@/lib/profile-validation";

type EditableEmployee = EmployeeSession & {
  jobTitle?: string | null;
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
  return draft.companyEntryDate ?? draft.hireDate ?? null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const initialEmployee = useMemo(() => getEmployee(), []);
  const [draft, setDraft] = useState<EditableEmployee | null>(initialEmployee as EditableEmployee | null);
  const [isSaving, setIsSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ProfileValidationErrors>({});

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
    const token = getToken();
    const employee = getEmployee();
    if (!token || !employee) {
      router.replace("/login");
      return;
    }
    if (employee.status !== "ACTIVE") {
      router.replace("/login");
      return;
    }
    if (hasRequiredProfileData(employee)) {
      router.replace(routeForRole(employee.role, employee.isDsiAdmin, employee.departmentType ?? null));
      return;
    }

    const load = async () => {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.employee) {
        const merged = {
          ...employee,
          ...data.employee,
        } as EditableEmployee;
        localStorage.setItem("employee", JSON.stringify(merged));
        setDraft(merged);
        if (hasRequiredProfileData(merged)) {
          router.replace(routeForRole(merged.role, merged.isDsiAdmin, merged.departmentType ?? null));
        }
      }
    };
    void load();
  }, [router]);

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

  const saveOnboarding = async () => {
    if (!draft) return;

    const hireDate = toDateInputValue(currentHireDateValue(draft));
    const errors = validateOnboardingProfileInput({
      ...draft,
      hireDate,
      companyEntryDate: hireDate,
    });
    if (photoError) errors.profilePhotoUrl = photoError;
    const firstError = firstProfileValidationError(errors);
    if (firstError) {
      setFieldErrors(errors);
      toast.error(firstError);
      return;
    }
    setFieldErrors({});

    const token = getToken();
    if (!token) return;
    setIsSaving(true);
    const t = toast.loading("Enregistrement de votre profil...");

    try {
      const res = await fetch("/api/auth/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          onboarding: true,
          firstName: draft.firstName,
          lastName: draft.lastName,
          jobTitle: draft.jobTitle ?? null,
          phone: draft.phone ?? null,
          fullAddress: draft.fullAddress ?? null,
          profilePhotoUrl: draft.profilePhotoUrl ?? null,
          hireDate: hireDate ?? null,
          companyEntryDate: hireDate ?? null,
          cnpsNumber: draft.cnpsNumber ?? null,
          gender: draft.gender ?? null,
          maritalStatus: draft.maritalStatus ?? null,
          childrenCount: draft.childrenCount ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMessage = profilePhotoSaveErrorMessage(
          res.status,
          data?.error,
          "Impossible de finaliser l'onboarding."
        );
        if (isProfileField(data?.field)) {
          setFieldError(data.field, errorMessage);
        }
        if (data?.field === "profilePhotoUrl" || errorMessage.toLowerCase().includes("photo")) {
          setPhotoError(errorMessage);
        }
        toast.error(errorMessage, { id: t });
        return;
      }

      const updated = { ...draft, ...(data?.employee ?? {}) };
      localStorage.setItem("employee", JSON.stringify(updated));
      toast.success("Profil complété. Bienvenue.", { id: t });
      router.replace(routeForRole(updated.role, updated.isDsiAdmin, updated.departmentType ?? null));
    } catch {
      const message = draft.profilePhotoUrl
        ? "Envoi impossible. La photo est peut-être trop volumineuse, essayez une image plus légère."
        : "Erreur réseau lors de l'envoi du profil.";
      if (draft.profilePhotoUrl) {
        setPhotoError(message);
        setFieldError("profilePhotoUrl", message);
      }
      toast.error(message, { id: t });
    } finally {
      setIsSaving(false);
    }
  };

  if (!draft) return null;
  const phone = parsePhone(draft.phone);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white border border-vdm-gold-200 rounded-2xl p-6 space-y-5">
        <div>
          <div className="text-2xl font-semibold text-vdm-gold-800">Information Complémentaire</div>
          <div className="text-sm text-vdm-gold-700">Complétez vos informations.</div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs text-vdm-gold-600 mb-1">Prénom</div>
            <input
              value={draft.firstName ?? ""}
              onChange={(e) => {
                clearFieldError("firstName");
                setDraft({ ...draft, firstName: e.target.value });
              }}
              aria-invalid={Boolean(fieldErrors.firstName)}
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm"
            />
            {fieldErrors.firstName ? (
              <div className="mt-1 text-xs text-red-600">{fieldErrors.firstName}</div>
            ) : null}
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600 mb-1">Nom</div>
            <input
              value={draft.lastName ?? ""}
              onChange={(e) => {
                clearFieldError("lastName");
                setDraft({ ...draft, lastName: e.target.value });
              }}
              aria-invalid={Boolean(fieldErrors.lastName)}
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm"
            />
            {fieldErrors.lastName ? (
              <div className="mt-1 text-xs text-red-600">{fieldErrors.lastName}</div>
            ) : null}
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600 mb-1">Genre (obligatoire)</div>
            <select
              value={draft.gender ?? ""}
              onChange={(e) => {
                const next = e.target.value;
                clearFieldError("gender");
                setDraft({
                  ...draft,
                  gender: isEmployeeGender(next) ? (next as EmployeeGender) : null,
                });
              }}
              aria-invalid={Boolean(fieldErrors.gender)}
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm bg-white"
            >
              <option value="">Sélectionner</option>
              {EMPLOYEE_GENDERS.map((gender) => (
                <option key={gender} value={gender}>
                  {EMPLOYEE_GENDER_LABELS[gender]}
                </option>
              ))}
            </select>
            {fieldErrors.gender ? (
              <div className="mt-1 text-xs text-red-600">{fieldErrors.gender}</div>
            ) : null}
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600 mb-1">Poste</div>
            <input
              value={draft.jobTitle ?? ""}
              onChange={(e) => {
                clearFieldError("jobTitle");
                setDraft({ ...draft, jobTitle: e.target.value });
              }}
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm"
              placeholder="Intitulé du poste"
            />
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600 mb-1">Statut matrimonial (obligatoire)</div>
            <select
              value={draft.maritalStatus ?? ""}
              onChange={(e) => {
                const next = e.target.value;
                clearFieldError("maritalStatus");
                setDraft({
                  ...draft,
                  maritalStatus: isMaritalStatus(next) ? next : null,
                });
              }}
              aria-invalid={Boolean(fieldErrors.maritalStatus)}
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm bg-white"
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
            <div className="text-xs text-vdm-gold-600 mb-1">Nombre d'enfants (obligatoire)</div>
            <input
              type="number"
              min={0}
              value={draft.childrenCount ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                clearFieldError("childrenCount");
                setDraft({
                  ...draft,
                  childrenCount: raw === "" ? null : Number(raw.replace(/\D/g, "")),
                });
              }}
              inputMode="numeric"
              aria-invalid={Boolean(fieldErrors.childrenCount)}
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm"
              placeholder="0"
            />
            {fieldErrors.childrenCount ? (
              <div className="mt-1 text-xs text-red-600">{fieldErrors.childrenCount}</div>
            ) : null}
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600 mb-1">Téléphone (obligatoire)</div>
            <div className="flex gap-2">
              <div className="w-24">
                <input
                  value={phone.country ? `+${phone.country}` : "+"}
                  onChange={(e) => {
                    const nextCountry = e.target.value.replace(/\D/g, "").slice(0, 3);
                    clearFieldError("phone");
                    setDraft({
                      ...draft,
                      phone: composePhone(nextCountry, phone.local),
                    });
                  }}
                  aria-invalid={Boolean(fieldErrors.phone)}
                  className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm"
                  placeholder="+225"
                />
              </div>
              <input
                value={formatLocalPhone(phone.local)}
                onChange={(e) => {
                  clearFieldError("phone");
                  setDraft({
                    ...draft,
                    phone: composePhone(phone.country, e.target.value),
                  });
                }}
                aria-invalid={Boolean(fieldErrors.phone)}
                className="flex-1 border border-vdm-gold-200 rounded-md p-2 text-sm"
                placeholder="00 00 00 00 00"
                inputMode="numeric"
              />
            </div>
            {fieldErrors.phone ? <div className="mt-1 text-xs text-red-600">{fieldErrors.phone}</div> : null}
          </div>
          <div className="">
            <div className="text-xs text-vdm-gold-600 mb-1">Adresse précise (obligatoire)</div>
            <input
              value={draft.fullAddress ?? ""}
              onChange={(e) => {
                clearFieldError("fullAddress");
                setDraft({ ...draft, fullAddress: e.target.value });
              }}
              aria-invalid={Boolean(fieldErrors.fullAddress)}
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm"
              placeholder="Rue, ville, code postal, pays"
            />
            {fieldErrors.fullAddress ? (
              <div className="mt-1 text-xs text-red-600">{fieldErrors.fullAddress}</div>
            ) : null}
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600 mb-1">
              Date d'entrée dans l'entreprise (obligatoire)
            </div>
            <input
              type="date"
              value={toDateInputValue(currentHireDateValue(draft))}
              onChange={(e) => {
                clearFieldError("companyEntryDate");
                clearFieldError("hireDate");
                setDraft({
                  ...draft,
                  hireDate: e.target.value,
                  companyEntryDate: e.target.value,
                });
              }}
              aria-invalid={Boolean(fieldErrors.companyEntryDate || fieldErrors.hireDate)}
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm"
            />
            {fieldErrors.companyEntryDate || fieldErrors.hireDate ? (
              <div className="mt-1 text-xs text-red-600">
                {fieldErrors.companyEntryDate ?? fieldErrors.hireDate}
              </div>
            ) : null}
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600 mb-1">Numéro CNPS (obligatoire)</div>
            <input
              value={draft.cnpsNumber ?? ""}
              onChange={(e) => {
                clearFieldError("cnpsNumber");
                setDraft({ ...draft, cnpsNumber: e.target.value });
              }}
              aria-invalid={Boolean(fieldErrors.cnpsNumber)}
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm"
              placeholder="Ex : CNPS-123456"
            />
            {fieldErrors.cnpsNumber ? (
              <div className="mt-1 text-xs text-red-600">{fieldErrors.cnpsNumber}</div>
            ) : null}
          </div>
          <div className="md:col-span-2">
            <div className="text-xs text-vdm-gold-600 mb-1">Photo de profil (facultative)</div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onProfilePhotoChange(e.target.files?.[0] ?? null)}
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm bg-white file:bg-vdm-gold-50 file:text-vdm-gold-800 file:border file:border-vdm-gold-200 file:rounded-md file:px-3 file:py-1 file:mr-3"
            />
            {fieldErrors.profilePhotoUrl || photoError ? (
              <div className="mt-1 text-xs text-red-600">{fieldErrors.profilePhotoUrl ?? photoError}</div>
            ) : null}
            {draft.profilePhotoUrl ? (
              <div className="mt-3">
                <Image
                  src={draft.profilePhotoUrl}
                  alt="Aperçu photo"
                  width={80}
                  height={80}
                  className="h-20 w-20 rounded-full object-cover border border-vdm-gold-200"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={saveOnboarding}
            disabled={isSaving}
            className="px-4 py-2 rounded-md bg-vdm-gold-700 text-white text-sm hover:bg-vdm-gold-800 disabled:opacity-60"
          >
            {isSaving ? "Enregistrement..." : "Finaliser Votre Espace"}
          </button>
        </div>
      </div>
    </div>
  );
}
