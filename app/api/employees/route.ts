export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt, jsonError } from "@/lib/auth";
import { requireRoleOrDsiAdmin } from "@/lib/dsiAdmin";
import { norm } from "@/lib/validators";
import { syncAllActiveEmployeesLeaveBalance } from "@/lib/leave-balance";
import * as employeesService from "@/lib/services/employees.service";
import { serviceErrorToResponse } from "@/lib/services/service-error";
import { logError } from "@/lib/logger";

export async function GET(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const url = new URL(req.url);
  const q = norm(url.searchParams.get("q"));
  const fast = url.searchParams.get("fast") === "1";

  if (!fast) {
    await syncAllActiveEmployeesLeaveBalance();
  }

  // Pagination : ?take=100 (max 300), ?skip=0
  const DEFAULT_TAKE = 100;
  const MAX_TAKE = 300;
  const takeRaw = Number(url.searchParams.get("take") ?? DEFAULT_TAKE);
  const skipRaw = Number(url.searchParams.get("skip") ?? 0);
  const take = Math.min(MAX_TAKE, Math.max(1, Number.isFinite(takeRaw) ? takeRaw : DEFAULT_TAKE));
  const skip = Math.max(0, Number.isFinite(skipRaw) ? skipRaw : 0);

  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { firstName: { contains: q, mode: "insensitive" as const } },
          { lastName: { contains: q, mode: "insensitive" as const } },
          { matricule: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      select: {
        id: true,
        email: true,
        matricule: true,
        firstName: true,
        lastName: true,
        profilePhotoUrl: true,
        jobTitle: true,
        role: true,
        status: true,
        leaveBalance: true,
        leaveBalanceAdjustment: true,
        firstYearLeaveUsedDays: true,
        firstYearLeaveUsedYear: true,
        hireDate: true,
        companyEntryDate: true,
        departmentId: true,
        serviceId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.employee.count({ where }),
  ]);

  const employeesWithAnnualBalance = employees.map((employee) => ({
    ...employee,
    annualLeaveBalance: Number(employee.leaveBalance ?? 0),
  }));

  return NextResponse.json({ employees: employeesWithAnnualBalance, total, take, skip });
}

export async function POST(req: Request) {
  // Création d'employé : CEO, ACCOUNTANT, ou admin DSI.
  // Route migrée vers la couche service — la logique métier est dans `lib/services/employees.service.ts`.
  const v = await requireRoleOrDsiAdmin(req, ["CEO", "ACCOUNTANT"]);
  if (!v.ok) return v.error;

  try {
    const body = await req.json().catch(() => ({}));

    const firstName = norm(body?.firstName);
    const lastName = norm(body?.lastName);
    const email = norm(body?.email).toLowerCase();
    const matricule = norm(body?.matricule) || null;
    const password = norm(body?.password);

    if (!firstName || !lastName || !email || !password) {
      return jsonError("Champs requis: firstName, lastName, email, password", 400);
    }

    const employee = await employeesService.createEmployee({
      firstName,
      lastName,
      email,
      matricule,
      password,
      jobTitle: body?.jobTitle ?? null,
      departmentId: body?.departmentId ?? null,
      serviceId: body?.serviceId ?? null,
    });

    return NextResponse.json({ employee }, { status: 201 });
  } catch (e: unknown) {
    logError("employees:POST", e, "création employé : erreur serveur");
    return serviceErrorToResponse(e);
  }
}
