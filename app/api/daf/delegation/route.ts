export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonServerError, requireAuthCtx } from "@/lib/auth";
import { isDafDirector, normalizeDafPermissions } from "@/lib/daf-delegation";
import { logError } from "@/lib/logger";

function permissionPayload(body: Record<string, unknown>) {
  return {
    canManageDafHolidays: Boolean(body?.canManageDafHolidays ?? body?.holidays),
    canManageDafLeaveBalances: Boolean(body?.canManageDafLeaveBalances ?? body?.leaveBalance),
    canManageDafContractDocuments: Boolean(
      body?.canManageDafContractDocuments ?? body?.contractDocuments
    ),
    canManageDafSalarySlips: Boolean(body?.canManageDafSalarySlips ?? body?.salarySlips),
  };
}

function hasAnyPermission(payload: ReturnType<typeof permissionPayload>) {
  return (
    payload.canManageDafHolidays ||
    payload.canManageDafLeaveBalances ||
    payload.canManageDafContractDocuments ||
    payload.canManageDafSalarySlips
  );
}

async function requireDafDirector(req: Request) {
  const authRes = requireAuthCtx(req);
  if (!authRes.ok) return authRes;
  const allowed = await isDafDirector(authRes.auth.id);
  if (!allowed) {
    return { ok: false as const, error: jsonError("Accès refusé (direction DAF requise)", 403) };
  }
  return authRes;
}

export async function GET(req: Request) {
  const authRes = await requireDafDirector(req);
  if (!authRes.ok) return authRes.error;

  const dafDepartment = await prisma.department.findFirst({
    where: { type: "DAF" },
    select: { id: true },
  });

  if (!dafDepartment) return NextResponse.json({ employees: [] });

  const employees = await prisma.employee.findMany({
    where: {
      departmentId: dafDepartment.id,
      status: "ACTIVE",
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      matricule: true,
      jobTitle: true,
      role: true,
      profilePhotoUrl: true,
      canManageDafHolidays: true,
      canManageDafLeaveBalances: true,
      canManageDafContractDocuments: true,
      canManageDafSalarySlips: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return NextResponse.json({
    employees: employees.map((employee) => ({
      ...employee,
      dafPermissions: normalizeDafPermissions(employee),
    })),
  });
}

export async function PATCH(req: Request) {
  const authRes = await requireDafDirector(req);
  if (!authRes.ok) return authRes.error;

  try {
    const body = await req.json().catch(() => ({}));
    const employeeId = String(body?.employeeId ?? "").trim();
    if (!employeeId) return jsonError("employeeId requis", 400);

    const dafDepartment = await prisma.department.findFirst({
      where: { type: "DAF" },
      select: { id: true },
    });
    if (!dafDepartment) return jsonError("Département DAF introuvable", 404);

    const target = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        departmentId: true,
        status: true,
        role: true,
      },
    });

    if (!target) return jsonError("Employé introuvable", 404);
    if (target.departmentId !== dafDepartment.id || target.status !== "ACTIVE") {
      return jsonError("Le délégué doit être un membre actif du département DAF", 400);
    }
    if (target.role === "CEO") {
      return jsonError("Le PDG ne peut pas être délégué DAF", 400);
    }

    const nextPermissions = permissionPayload(body);
    const employee = await prisma.$transaction(async (tx) => {
      if (hasAnyPermission(nextPermissions)) {
        await tx.employee.updateMany({
          where: {
            departmentId: dafDepartment.id,
            id: { not: employeeId },
          },
          data: {
            canManageDafHolidays: false,
            canManageDafLeaveBalances: false,
            canManageDafContractDocuments: false,
            canManageDafSalarySlips: false,
          },
        });
      }

      return tx.employee.update({
        where: { id: employeeId },
        data: nextPermissions,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          matricule: true,
          jobTitle: true,
          role: true,
          profilePhotoUrl: true,
          canManageDafHolidays: true,
          canManageDafLeaveBalances: true,
          canManageDafContractDocuments: true,
          canManageDafSalarySlips: true,
        },
      });
    });

    return NextResponse.json({
      employee: {
        ...employee,
        dafPermissions: normalizeDafPermissions(employee),
      },
    });
  } catch (error) {
    logError("daf/delegation:PATCH", error, "mise à jour délégation DAF : erreur serveur");
    return jsonServerError(error, "Impossible d'enregistrer la délégation DAF");
  }
}
