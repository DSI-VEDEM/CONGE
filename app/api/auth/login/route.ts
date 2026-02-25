export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { jsonError } from "@/lib/auth";
import { norm } from "@/lib/validators";
import { syncEmployeeLeaveBalance } from "@/lib/leave-balance";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const identifier = norm(body?.identifier); // email OU matricule
    const password = norm(body?.password);

    if (!identifier || !password) {
      return jsonError("Champs requis: identifier, password", 400);
    }

    const employee = await prisma.employee.findFirst({
      where: { OR: [{ email: identifier }, { matricule: identifier }] },
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

    if (!employee) return jsonError("Identifiants invalides", 401);

    const valid = await bcrypt.compare(password, employee.password);
    if (!valid) return jsonError("Identifiants invalides", 401);
    const synced = await syncEmployeeLeaveBalance(prisma, employee.id);

    // Blocage tant que pas validé par l'admin (DSI)
    if (employee.status !== "ACTIVE") {
      return jsonError("Compte en attente de validation par l’admin", 403, {
        status: employee.status,
      });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) return jsonError("JWT_SECRET manquant côté serveur", 500);

    const dsiResponsibility = await prisma.departmentResponsibility.findFirst({
      where: {
        employeeId: employee.id,
        endAt: null,
        department: { type: "DSI" },
        role: { in: ["RESPONSABLE", "CO_RESPONSABLE"] },
      },
      select: { id: true },
    });

    const isDsiAdmin = Boolean(dsiResponsibility);
    const departmentType = employee.department?.type ?? null;

    const token = jwt.sign(
      {
        sub: employee.id,
        email: employee.email,
        matricule: employee.matricule ?? null,
        role: employee.role,
        status: employee.status,
        departmentId: employee.departmentId ?? null,
        serviceId: employee.serviceId ?? null,
        isDsiAdmin,
        departmentType,
      },
      secret,
      { expiresIn: "7d" }
    );

    return NextResponse.json({
      token,
      employee: {
        id: employee.id,
        email: employee.email,
        matricule: employee.matricule,
        firstName: employee.firstName,
        lastName: employee.lastName,
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
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    return jsonError("Erreur serveur", 500, { code: err?.code, details: err?.message });
  }
}
