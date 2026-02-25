export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt, jsonError } from "@/lib/auth";
import { isDsiAdmin } from "@/lib/dsiAdmin";
import type { EmployeeRole, EmployeeStatus } from "@/generated/prisma/client";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const params = await ctx.params;
  const id = params.id;

  const adminId = String(v.payload?.sub ?? "");
  if (!adminId) return jsonError("Token invalide", 401);

  const ok = await isDsiAdmin(adminId);
  if (!ok) return jsonError("Accès refusé (admin DSI requis)", 403);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const status = typeof body?.status === "string" ? body.status : null;
  const role = typeof body?.role === "string" ? body.role : null;
  const departmentId = typeof body?.departmentId === "string" ? body.departmentId : null;
  const serviceId = typeof body?.serviceId === "string" ? body.serviceId : null;

  const allowedStatuses: EmployeeStatus[] = ["ACTIVE", "REJECTED"];
  if (!status || !allowedStatuses.includes(status as EmployeeStatus)) {
    return jsonError("status invalide (ACTIVE|REJECTED)", 400);
  }
  const parsedStatus = status as EmployeeStatus;

  const allowedRoles: EmployeeRole[] = ["EMPLOYEE", "ACCOUNTANT", "DEPT_HEAD", "SERVICE_HEAD"];
  if (parsedStatus === "ACTIVE" && role && !allowedRoles.includes(role as EmployeeRole)) {
    return jsonError("role invalide (EMPLOYEE|ACCOUNTANT|DEPT_HEAD|SERVICE_HEAD)", 400);
  }
  const parsedRole = role as EmployeeRole | null;

  if (parsedStatus === "ACTIVE" && parsedRole === "SERVICE_HEAD") {
    if (!departmentId) {
      return jsonError("departmentId requis pour SERVICE_HEAD", 400);
    }
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { type: true },
    });
    if (!department || department.type !== "OPERATIONS") {
      return jsonError("SERVICE_HEAD doit être rattaché au département OPERATIONS", 400);
    }
  }

  if (parsedStatus === "ACTIVE" && parsedRole === "DEPT_HEAD" && departmentId) {
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { type: true },
    });
    if (department?.type === "OTHERS") {
      return jsonError("Le département OTHERS est réservé au PDG", 400);
    }
  }

  if (parsedStatus === "ACTIVE" && parsedRole === "ACCOUNTANT") {
    if (!departmentId) {
      return jsonError("departmentId requis pour ACCOUNTANT", 400);
    }
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { type: true },
    });
    if (!department || department.type !== "DAF") {
      return jsonError("ACCOUNTANT doit être rattaché au département DAF", 400);
    }
  }

  // Empêcher de re-valider un compte déjà traité
  const current = await prisma.employee.findUnique({
    where: { id },
    select: { status: true },
  });

  if (!current) return jsonError("Employé introuvable", 404);

  if (current.status !== "PENDING") {
    return jsonError("Ce compte a déjà été traité", 409, { currentStatus: current.status });
  }

  const updated = await prisma.employee.update({
    where: { id },
    data: {
      status: parsedStatus,
      ...(parsedStatus === "ACTIVE" && parsedRole ? { role: parsedRole } : {}),
      ...(parsedStatus === "ACTIVE" ? { departmentId } : {}),
      ...(parsedStatus === "ACTIVE" ? { serviceId } : {}),
      approvedById: adminId,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      matricule: true,
      role: true,
      status: true,
      approvedById: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ employee: updated });
}
