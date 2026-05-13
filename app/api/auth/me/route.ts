export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { jsonError, verifyJwt } from "@/lib/auth";
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

  const data: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(body, "hireDate")) {
    const parsed = parseIsoDate(body?.hireDate);
    if (!parsed) return jsonError("Date d'embauche invalide", 400);
    data.hireDate = parsed;
  }
  if (Object.prototype.hasOwnProperty.call(body, "companyEntryDate")) {
    const parsed = parseIsoDate(body?.companyEntryDate);
    if (!parsed) return jsonError("Date d'entrée invalide", 400);
    data.companyEntryDate = parsed;
  }

  if (Object.prototype.hasOwnProperty.call(body, "firstName")) {
    const value = norm(body?.firstName);
    if (!value) return jsonError("firstName invalide", 400);
    data.firstName = value;
  }
  if (Object.prototype.hasOwnProperty.call(body, "lastName")) {
    const value = norm(body?.lastName);
    if (!value) return jsonError("lastName invalide", 400);
    data.lastName = value;
  }
  if (Object.prototype.hasOwnProperty.call(body, "email")) {
    return jsonError("email non modifiable", 400);
  }
  if (Object.prototype.hasOwnProperty.call(body, "jobTitle")) {
    data.jobTitle = norm(body?.jobTitle) || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "phone")) {
    const value = norm(body?.phone);
    data.phone = value || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "profilePhotoUrl")) {
    const value = norm(body?.profilePhotoUrl);
    if (!value) {
      data.profilePhotoUrl = null;
    } else if (isProfilePhotoDataUrlTooLarge(value)) {
      return jsonError(PROFILE_PHOTO_TOO_LARGE_MESSAGE, 413);
    } else if (!isValidHttpUrl(value) && !isProfilePhotoDataUrl(value)) {
      return jsonError(PROFILE_PHOTO_INVALID_MESSAGE, 400);
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
    if (!value) {
      data.cnpsNumber = null;
    } else if (value.length > 50) {
      return jsonError("Numéro CNPS invalide (max 50 caractères)", 400);
    } else {
      data.cnpsNumber = value;
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "gender")) {
    const value = norm(body?.gender);
    if (!value) {
      data.gender = null;
    } else if (!isEmployeeGender(value)) {
      return jsonError("gender invalide", 400);
    } else {
      data.gender = value;
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "maritalStatus")) {
    const value = norm(body?.maritalStatus);
    if (!value) {
      data.maritalStatus = null;
    } else if (!isMaritalStatus(value)) {
      return jsonError("maritalStatus invalide", 400);
    } else {
      data.maritalStatus = value;
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "childrenCount")) {
    const raw = body?.childrenCount;
    if (raw === "" || raw === null || raw === undefined) {
      data.childrenCount = null;
    } else {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return jsonError("childrenCount invalide", 400);
      }
      data.childrenCount = parsed;
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "password")) {
    const value = norm(body?.password);
    if (!value || value.length < 6) {
      return jsonError("Mot de passe invalide", 400);
    }
    data.password = await bcrypt.hash(value, 10);
  }

  if (Object.keys(data).length == 0) {
    return jsonError("Aucun champ a modifier", 400);
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
    console.error("Erreur mise à jour profil", error);
    return jsonError(
      "Impossible d'enregistrer le profil. Vérifiez les informations puis réessayez.",
      500
    );
  }

  if (!updated) return jsonError("Employé introuvable", 404);
  return NextResponse.json({ employee: updated });
}
