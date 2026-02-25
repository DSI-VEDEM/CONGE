"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  getEmployee,
  getToken,
  hasRequiredProfileData,
  routeForRole,
  type EmployeeSession,
} from "@/lib/auth-client";
import { isCompletePhone } from "@/lib/phone";
import {
  EmployeeGender,
  EMPLOYEE_GENDER_LABELS,
  EMPLOYEE_GENDERS,
  isEmployeeGender,
} from "@/lib/employee-gender";
import {
  MARITAL_STATUS_LABELS,
  MARITAL_STATUSES,
  isMaritalStatus,
} from "@/lib/marital-status";

type EditableEmployee = EmployeeSession & {
  jobTitle?: string | null;
};

const MAX_PROFILE_PHOTO_SIZE_BYTES = 2 * 1024 * 1024;

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
    const local = body.slice(sep + 1).replace(/\D/g, "").slice(0, 12);
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
  const [draft, setDraft] = useState<EditableEmployee | null>(
    initialEmployee as EditableEmployee | null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

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
      router.replace(
        routeForRole(
          employee.role,
          employee.isDsiAdmin,
          employee.departmentType ?? null
        )
      );
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
      }
    };
    void load();
  }, [router]);

  const onProfilePhotoChange = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Le fichier doit être une image.");
      return;
    }
    if (file.size > MAX_PROFILE_PHOTO_SIZE_BYTES) {
      setPhotoError("Image trop lourde (max 2 Mo).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result.startsWith("data:image/")) {
        setPhotoError("Format d'image invalide.");
        return;
      }
      setPhotoError(null);
      setDraft((prev) =>
        prev ? { ...prev, profilePhotoUrl: result } : prev
      );
    };
    reader.onerror = () =>
      setPhotoError("Erreur lors du chargement de l'image.");
    reader.readAsDataURL(file);
  };

  const saveOnboarding = async () => {
    if (!draft) return;

    if (!draft.profilePhotoUrl) {
      toast.error("Photo de profil obligatoire.");
      return;
    }
    if (!draft.phone || !String(draft.phone).trim()) {
      toast.error("Numéro de téléphone obligatoire.");
      return;
    }
    if (!isCompletePhone(draft.phone)) {
      toast.error(
        "Numéro invalide. Format attendu : +225 00 00 00 00 00 (indicatif modifiable)"
      );
      return;
    }
    if (!draft.fullAddress || !String(draft.fullAddress).trim()) {
      toast.error("Adresse précise obligatoire.");
      return;
    }
    const hireDate = currentHireDateValue(draft);
    if (!hireDate || !String(hireDate).trim()) {
      toast.error("Date d'entrée dans l'entreprise obligatoire.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(hireDate))) {
      toast.error(
        "Date d'entrée invalide. Utilisez le format YYYY-MM-DD."
      );
      return;
    }
    if (!draft.cnpsNumber || !String(draft.cnpsNumber).trim()) {
      toast.error("Numéro CNPS obligatoire.");
      return;
    }
    if (!draft.maritalStatus) {
      toast.error("Statut matrimonial obligatoire.");
      return;
    }
    if (
      draft.childrenCount === null ||
      draft.childrenCount === undefined ||
      !Number.isInteger(draft.childrenCount) ||
      draft.childrenCount < 0
    ) {
      toast.error("Nombre d'enfants invalide ou manquant.");
      return;
    }

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
        toast.error(
          data?.error || "Impossible de finaliser l'onboarding.",
          { id: t }
        );
        return;
      }

      const updated = { ...draft, ...(data?.employee ?? {}) };
      localStorage.setItem("employee", JSON.stringify(updated));
      toast.success("Profil complété. Bienvenue.", { id: t });
      router.replace(
        routeForRole(
          updated.role,
          updated.isDsiAdmin,
          updated.departmentType ?? null
        )
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!draft) return null;
  const phone = parsePhone(draft.phone);
  const hireDateValue = String(currentHireDateValue(draft) ?? "").trim();
  const childrenCountValid =
    typeof draft.childrenCount === "number" &&
    Number.isInteger(draft.childrenCount) &&
    draft.childrenCount >= 0;
  const canFinalize =
    Boolean(String(draft.firstName ?? "").trim()) &&
    Boolean(String(draft.lastName ?? "").trim()) &&
    Boolean(draft.gender) &&
    Boolean(draft.maritalStatus) &&
    Boolean(String(draft.profilePhotoUrl ?? "").trim()) &&
    !photoError &&
    Boolean(String(draft.phone ?? "").trim()) &&
    isCompletePhone(String(draft.phone ?? "")) &&
    Boolean(String(draft.fullAddress ?? "").trim()) &&
    /^\d{4}-\d{2}-\d{2}$/.test(hireDateValue) &&
    Boolean(String(draft.cnpsNumber ?? "").trim()) &&
    childrenCountValid;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white border border-vdm-gold-200 rounded-2xl p-6 space-y-5">
        <div>
          <div className="text-2xl font-semibold text-vdm-gold-800">
            Information Complémentaire
          </div>
          <div className="text-sm text-vdm-gold-700">
            Complétez vos informations.
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs text-vdm-gold-600 mb-1">Prénom</div>
            <input
              value={draft.firstName ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, firstName: e.target.value })
              }
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm"
            />
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600 mb-1">Nom</div>
            <input
              value={draft.lastName ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, lastName: e.target.value })
              }
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm"
            />
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600 mb-1">
              Genre (obligatoire)
            </div>
            <select
              value={draft.gender ?? ""}
              onChange={(e) => {
                const next = e.target.value;
                setDraft({
                  ...draft,
                  gender: isEmployeeGender(next) ? (next as EmployeeGender) : null,
                });
              }}
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm bg-white"
            >
              <option value="">Sélectionner</option>
              {EMPLOYEE_GENDERS.map((gender) => (
                <option key={gender} value={gender}>
                  {EMPLOYEE_GENDER_LABELS[gender]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600 mb-1">Poste</div>
            <input
              value={draft.jobTitle ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, jobTitle: e.target.value })
              }
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm"
              placeholder="Intitulé du poste"
            />
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600 mb-1">
              Statut matrimonial (obligatoire)
            </div>
            <select
              value={draft.maritalStatus ?? ""}
              onChange={(e) => {
                const next = e.target.value;
                setDraft({
                  ...draft,
                  maritalStatus: isMaritalStatus(next) ? next : null,
                });
              }}
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm bg-white"
            >
              <option value="">Sélectionner</option>
              {MARITAL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {MARITAL_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600 mb-1">
              Nombre d'enfants (obligatoire)
            </div>
            <input
              type="number"
              min={0}
              value={draft.childrenCount ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                setDraft({
                  ...draft,
                  childrenCount:
                    raw === "" ? null : Number(raw.replace(/\D/g, "")),
                });
              }}
              inputMode="numeric"
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm"
              placeholder="0"
            />
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600 mb-1">
              Téléphone (obligatoire)
            </div>
            <div className="flex gap-2">
              <div className="w-24">
                <input
                  value={phone.country ? `+${phone.country}` : "+"}
                  onChange={(e) => {
                    const nextCountry = e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 3);
                    setDraft({
                      ...draft,
                      phone: composePhone(nextCountry, phone.local),
                    });
                  }}
                  className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm"
                  placeholder="+225"
                />
              </div>
              <input
                value={formatLocalPhone(phone.local)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    phone: composePhone(phone.country, e.target.value),
                  })
                }
                className="flex-1 border border-vdm-gold-200 rounded-md p-2 text-sm"
                placeholder="00 00 00 00 00"
                inputMode="numeric"
              />
            </div>
          </div>
          <div className="">
            <div className="text-xs text-vdm-gold-600 mb-1">
              Adresse précise (obligatoire)
            </div>
            <input
              value={draft.fullAddress ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, fullAddress: e.target.value })
              }
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm"
              placeholder="Rue, ville, code postal, pays"
            />
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600 mb-1">
              Date d'entrée dans l'entreprise (obligatoire)
            </div>
            <input
              type="date"
              value={toDateInputValue(currentHireDateValue(draft))}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  hireDate: e.target.value,
                  companyEntryDate: e.target.value,
                })
              }
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm"
            />
          </div>
          <div>
            <div className="text-xs text-vdm-gold-600 mb-1">
              Numéro CNPS (obligatoire)
            </div>
            <input
              value={draft.cnpsNumber ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, cnpsNumber: e.target.value })
              }
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm"
              placeholder="Ex : CNPS-123456"
            />
          </div>
          <div className="md:col-span-2">
            <div className="text-xs text-vdm-gold-600 mb-1">
              Photo de profil (obligatoire)
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                onProfilePhotoChange(e.target.files?.[0] ?? null)
              }
              className="w-full border border-vdm-gold-200 rounded-md p-2 text-sm bg-white file:bg-vdm-gold-50 file:text-vdm-gold-800 file:border file:border-vdm-gold-200 file:rounded-md file:px-3 file:py-1 file:mr-3"
            />
            {photoError ? (
              <div className="mt-1 text-xs text-red-600">
                {photoError}
              </div>
            ) : null}
            {draft.profilePhotoUrl ? (
              <div className="mt-3">
                <img
                  src={draft.profilePhotoUrl}
                  alt="Aperçu photo"
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
            disabled={isSaving || !canFinalize}
            className="px-4 py-2 rounded-md bg-vdm-gold-700 text-white text-sm hover:bg-vdm-gold-800 disabled:opacity-60"
          >
            {isSaving ? "Enregistrement..." : "Finaliser Votre Espace"}
          </button>
        </div>
      </div>
    </div>
  );
}
