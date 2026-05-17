export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { jsonError, jsonServerError, setAuthCookie, signJwt } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validate";
import { loginSchema } from "@/lib/schemas/auth.schema";
import { syncEmployeeLeaveBalance } from "@/lib/leave-balance";
import { logError } from "@/lib/logger";

export async function POST(req: Request) {
  /// Authentifie par email / matricule et émet un cookie httpOnly + retourne le token (legacy).
  try {
    // Rate-limit : 10 tentatives / 10 minutes par IP
    const rl = rateLimit(req, { key: "auth:login", max: 10, windowMs: 10 * 60 * 1000 });
    if (!rl.ok) return rateLimitResponse(rl.resetAt);

    // Validation Zod
    const parsed = await parseBody(req, loginSchema);
    if (!parsed.ok) return parsed.error;
    const { identifier, password } = parsed.data;

    const employee = await prisma.employee.findFirst({
      where: { OR: [{ email: identifier }, { matricule: identifier }] },
      select: {
        id: true,
        email: true,
        matricule: true,
        firstName: true,
        lastName: true,
        jobTitle: true,
        phone: true,
        profilePhotoUrl: true,
        fullAddress: true,
        gender: true,
        hireDate: true,
        companyEntryDate: true,
        cnpsNumber: true,
        password: true,
        role: true,
        status: true,
        leaveBalance: true,
        departmentId: true,
        serviceId: true,
        maritalStatus: true,
        childrenCount: true,
        department: { select: { type: true } },
      },
    });

    // L'employé doit exister avant de vérifier le password
    if (!employee) return jsonError("Identifiants invalides", 401);

    const valid = await bcrypt.compare(password, employee.password);
    if (!valid) return jsonError("Identifiants invalides", 401);
    const synced = await syncEmployeeLeaveBalance(prisma, employee.id);

    // Blocage tant que le compte n'est pas passé en ACTIVE par un admin
    if (employee.status !== "ACTIVE") {
      return jsonError("Compte en attente de validation par l’admin", 403, {
        status: employee.status,
      });
    }

    const departmentType = employee.department?.type ?? null;
    const isDeptHeadDsi = employee.role === "DEPT_HEAD" && departmentType === "DSI";

    // Vérifie si l'utilisateur est responsable DSI pour activer les contrôles spéciaux.
    const dsiResponsibility = await prisma.departmentResponsibility.findFirst({
      where: {
        employeeId: employee.id,
        endAt: null,
        department: { type: "DSI" },
        role: { in: ["RESPONSABLE", "CO_RESPONSABLE"] },
      },
      select: { id: true },
    });

    const isDsiAdmin = Boolean(dsiResponsibility) || isDeptHeadDsi;

    // Génère le JWT (HS256 pinné dans signJwt)
    const token = signJwt({
      sub: employee.id,
      email: employee.email,
      matricule: employee.matricule ?? null,
      role: employee.role,
      status: employee.status,
      departmentId: employee.departmentId ?? null,
      serviceId: employee.serviceId ?? null,
      isDsiAdmin,
      departmentType,
    });

    const response = NextResponse.json({
      // token retourné en body pour la compat avec les clients qui lisent encore localStorage.
      // À retirer après migration complète du front vers le cookie.
      token,
      employee: {
        id: employee.id,
        email: employee.email,
        matricule: employee.matricule,
        firstName: employee.firstName,
        lastName: employee.lastName,
        jobTitle: employee.jobTitle ?? null,
        phone: employee.phone ?? null,
        profilePhotoUrl: employee.profilePhotoUrl ?? null,
        fullAddress: employee.fullAddress ?? null,
        gender: employee.gender ?? null,
        hireDate: employee.companyEntryDate ?? employee.hireDate ?? null,
        companyEntryDate: employee.companyEntryDate ?? employee.hireDate ?? null,
        cnpsNumber: employee.cnpsNumber ?? null,
        maritalStatus: employee.maritalStatus ?? null,
        childrenCount: employee.childrenCount ?? null,
        role: employee.role,
        status: employee.status,
        leaveBalance: synced?.employee.leaveBalance ?? employee.leaveBalance ?? 25,
        departmentId: employee.departmentId,
        serviceId: employee.serviceId,
        isDsiAdmin,
        departmentType,
      },
    });

    return setAuthCookie(response, token);
  } catch (e: unknown) {
    logError("auth/login", e, "erreur serveur lors du login");
    return jsonServerError(e);
  }
}
