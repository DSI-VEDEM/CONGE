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

  if (!operationsDepartment) {
    return NextResponse.json({ leaves: [] });
  }

  const url = new URL(req.url);
  const maxParam = Number(url.searchParams.get("maxLeaves") ?? url.searchParams.get("max"));
  const take =
    Number.isInteger(maxParam) && maxParam > 0
      ? Math.min(maxParam, 120)
      : 120;

  const leaves = await prisma.leaveRequest.findMany({
    where: {
      status: { in: ["APPROVED", "REJECTED", "CANCELLED"] },
      employee: {
        departmentId: operationsDepartment.id,
        ...(actor.role === "SERVICE_HEAD" ? { serviceId: actor.serviceId ?? "__none__" } : {}),
      },
    },
    select: {
      id: true,
      type: true,
      startDate: true,
      endDate: true,
      status: true,
      createdAt: true,
      employee: { select: { id: true, firstName: true, lastName: true, profilePhotoUrl: true, role: true, leaveBalance: true } },
      decisions: {
        where: { type: { in: ["APPROVE", "REJECT", "CANCEL"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          createdAt: true,
          actor: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  return NextResponse.json({ leaves });
}
