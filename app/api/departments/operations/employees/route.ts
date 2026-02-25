export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, verifyJwt } from "@/lib/auth";

export async function GET(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const actorId = String(v.payload?.sub ?? "");
  if (!actorId) return jsonError("Token invalide", 401);

  const actor = await prisma.employee.findUnique({
    where: { id: actorId },
    select: {
      id: true,
      role: true,
      serviceId: true,
      department: { select: { type: true } },
    },
  });

  if (!actor) return jsonError("Employé introuvable", 404);

  const canReadAsManager = actor.role === "DEPT_HEAD" || actor.role === "SERVICE_HEAD";
  const inOperations = actor.department?.type === "OPERATIONS";

  if (actor.role !== "CEO" && !(canReadAsManager && inOperations)) {
    return jsonError("Accès refusé", 403);
  }

  const operationsDepartment = await prisma.department.findFirst({
    where: { type: "OPERATIONS" },
    select: { id: true },
  });

  if (!operationsDepartment) return NextResponse.json({ employees: [] });

  const serviceScoped =
    actor.role === "SERVICE_HEAD"
      ? actor.serviceId
        ? { serviceId: actor.serviceId }
        : { id: "__none__" }
      : {};

  const url = new URL(req.url);
  const maxParam = Number(url.searchParams.get("maxEmployees") ?? url.searchParams.get("max"));
  const take =
    Number.isInteger(maxParam) && maxParam > 0
      ? Math.min(maxParam, 120)
      : 120;

  const employees = await prisma.employee.findMany({
    where: {
      departmentId: operationsDepartment.id,
      ...serviceScoped,
      id: { not: actor.id },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      profilePhotoUrl: true,
      email: true,
      matricule: true,
      jobTitle: true,
      role: true,
      status: true,
      departmentId: true,
      serviceId: true,
      department: { select: { id: true, name: true, type: true } },
      service: { select: { id: true, name: true, type: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  return NextResponse.json({ employees });
}
