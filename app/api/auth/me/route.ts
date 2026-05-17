export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { jsonError, verifyJwt } from "@/lib/auth";
import { logError } from "@/lib/logger";
import { norm } from "@/lib/validators";
import { isEmployeeGender } from "@/lib/employee-gender";
import { isMaritalStatus } from "@/lib/marital-status";
import { syncEmployeeLeaveBalance } from "@/lib/leave-balance";
import {
  PROFILE_PHOTO_INVALID_MESSAGE,
  PROFILE_PHOTO_TOO_LARGE_MESSAGE,
  isProfilePhotoDataUrl,
  isProfilePhotoDataUrlTooLarge,
} from "@/lib/profile-photo";
import {
  PROFILE_MESSAGES,
  firstProfileValidationField,
  profileChildrenCountError,
  profileCnpsError,
  profileDateError,
  profileGenderError,
  profileMaritalStatusError,
  profilePasswordError,
  profilePhoneError,
  profileTextRequiredError,
  validateOnboardingProfileInput,
  type ProfileField,
} from "@/lib/profile-validation";

/// Valide si la chaîne est une URL http(s) (utilisée pour les avatars externes).
function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/// Convertit une date ISO YYYY-MM-DD en Date UTC ou null.
function parseIsoDate(value: unknown) {
  const raw = norm(value);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return null;
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function profileFieldError(field: ProfileField, message: string, status = 400) {
  return jsonError(message, status, { field });
}

export async function GET(req: Request) {
  // Fournit les informations du profil connecté (après sync du solde de congés).
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const id = String(v.payload?.sub ?? "");
  if (!id) return NextResponse.json({ error: "Token invalide" }, { status: 401 });
  await syncEmployeeLeaveBalance(prisma, id);

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      matricule: true,
      firstName: true,
      lastName: true,
      phone: true,
      profilePhotoUrl: true,
      fullAddress: true,
      gender: true,
      hireDate: true,
      companyEntryDate: true,
      cnpsNumber: true,
      jobTitle: true,
      role: true,
      status: true,
      departmentId: true,
      serviceId: true,
      maritalStatus: true,
      childrenCount: true,
      hireDateFormatted: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!employee) return NextResponse.json({ error: "Employé introuvable" }, { status: 404 });
  return NextResponse.json({ employee });
}

export async function PUT(req: Request) {
  // Met à jour les champs autorisés sur le profil (pas d'email, pas de rôle).
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const id = String(v.payload?.sub ?? "");
  if (!id) return jsonError("Token invalide", 401);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonError("Données du formulaire invalides", 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonError(
      "Données du formulaire illisibles. Si une photo est jointe, elle est peut-être trop volumineuse.",
      400
    );
  }

  if (body.onboarding === true) {
    const errors = validateOnboardingProfileInput(body);
    const field = firstProfileValidationField(errors);
    if (field) {
      const message = errors[field] as string;
      const status = field === "profilePhotoUrl" && message === PROFILE_PHOTO_TOO_LARGE_MESSAGE ? 413 : 400;
      return profileFieldError(field, message, status);
    }
  }

  const data: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(body, "hireDate")) {
    const error = profileDateError(body?.hireDate, true);
    if (error) return profileFieldError("hireDate", error);
    const parsed = parseIsoDate(body?.hireDate);
    data.hireDate = parsed;
  }
  if (Object.prototype.hasOwnProperty.call(body, "companyEntryDate")) {
    const error = profileDateError(body?.companyEntryDate, true);
    if (error) return profileFieldError("companyEntryDate", error);
    const parsed = parseIsoDate(body?.companyEntryDate);
    data.companyEntryDate = parsed;
  }

  if (Object.prototype.hasOwnProperty.call(body, "firstName")) {
    const value = norm(body?.firstName);
    const error = profileTextRequiredError(value, PROFILE_MESSAGES.firstNameRequired);
    if (error) return profileFieldError("firstName", error);
    data.firstName = value;
  }
  if (Object.prototype.hasOwnProperty.call(body, "lastName")) {
    const value = norm(body?.lastName);
    const error = profileTextRequiredError(value, PROFILE_MESSAGES.lastNameRequired);
    if (error) return profileFieldError("lastName", error);
    data.lastName = value;
  }
  if (Object.prototype.hasOwnProperty.call(body, "email")) {
    return profileFieldError("email", PROFILE_MESSAGES.emailNotEditable);
  }
  if (Object.prototype.hasOwnProperty.call(body, "jobTitle")) {
    data.jobTitle = norm(body?.jobTitle) || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "phone")) {
    const value = norm(body?.phone);
    const error = profilePhoneError(value, false);
    if (error) return profileFieldError("phone", error);
    data.phone = value || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "profilePhotoUrl")) {
    const value = norm(body?.profilePhotoUrl);
    if (!value) {
      data.profilePhotoUrl = null;
    } else if (isProfilePhotoDataUrlTooLarge(value)) {
      return profileFieldError("profilePhotoUrl", PROFILE_PHOTO_TOO_LARGE_MESSAGE, 413);
    } else if (!isValidHttpUrl(value) && !isProfilePhotoDataUrl(value)) {
      return profileFieldError("profilePhotoUrl", PROFILE_PHOTO_INVALID_MESSAGE);
    } else {
      data.profilePhotoUrl = value;
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "fullAddress")) {
    const value = norm(body?.fullAddress);
    data.fullAddress = value || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "cnpsNumber")) {
    const value = norm(body?.cnpsNumber);
    const error = profileCnpsError(value, false);
    if (error) return profileFieldError("cnpsNumber", error);
    if (!value) {
      data.cnpsNumber = null;
    } else {
      data.cnpsNumber = value;
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "gender")) {
    const value = norm(body?.gender);
    const error = profileGenderError(value, false);
    if (error) return profileFieldError("gender", error);
    if (!value) {
      data.gender = null;
    } else if (isEmployeeGender(value)) {
      data.gender = value;
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "maritalStatus")) {
    const value = norm(body?.maritalStatus);
    const error = profileMaritalStatusError(value, false);
    if (error) return profileFieldError("maritalStatus", error);
    if (!value) {
      data.maritalStatus = null;
    } else if (isMaritalStatus(value)) {
      data.maritalStatus = value;
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "childrenCount")) {
    const raw = body?.childrenCount;
    const error = profileChildrenCountError(raw, false);
    if (error) return profileFieldError("childrenCount", error);
    if (raw === "" || raw === null || raw === undefined) {
      data.childrenCount = null;
    } else {
      const parsed = Number(raw);
      data.childrenCount = parsed;
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "password")) {
    const value = norm(body?.password);
    const error = profilePasswordError(value) ?? (!value ? PROFILE_MESSAGES.passwordInvalid : null);
    if (error) return profileFieldError("password", error);

    // Sécurité : exiger l'ancien mot de passe pour autoriser le changement.
    // Le mot de passe actuel (potentiellement temporaire après reset DSI)
    // doit toujours être fourni pour confirmer la possession du compte.
    const currentPassword = norm(body?.currentPassword);
    if (!currentPassword) {
      return jsonError("Mot de passe actuel requis pour modifier le mot de passe", 400, {
        field: "currentPassword",
      });
    }
    const current = await prisma.employee.findUnique({
      where: { id },
      select: { password: true },
    });
    if (!current) return jsonError("Employé introuvable", 404);
    const valid = await bcrypt.compare(currentPassword, current.password);
    if (!valid) {
      return jsonError("Mot de passe actuel incorrect", 401, { field: "currentPassword" });
    }

    data.password = await bcrypt.hash(value, 10);
    // Une fois changé volontairement, on retire le flag de changement forcé.
    // (`mustChangePassword` est typé après `npx prisma generate`.)
    data.mustChangePassword = false;
  }

  if (Object.keys(data).length == 0) {
    return jsonError(PROFILE_MESSAGES.noFieldChanged, 400);
  }

  let updated;
  try {
    await prisma.employee.update({
      where: { id },
      data,
    });
    await syncEmployeeLeaveBalance(prisma, id);
    updated = await prisma.employee.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        matricule: true,
        firstName: true,
        lastName: true,
        phone: true,
        profilePhotoUrl: true,
        fullAddress: true,
        gender: true,
        hireDate: true,
        companyEntryDate: true,
        cnpsNumber: true,
        jobTitle: true,
        role: true,
        status: true,
        leaveBalance: true,
        departmentId: true,
        serviceId: true,
        maritalStatus: true,
        childrenCount: true,
      },
    });
  } catch (error) {
    logError("auth/me:PUT", error, "Erreur mise à jour profil");
    return jsonError("Impossible d'enregistrer le profil. Vérifiez les informations puis réessayez.", 500);
  }

  if (!updated) return jsonError("Employé introuvable", 404);
  return NextResponse.json({ employee: updated });
}
