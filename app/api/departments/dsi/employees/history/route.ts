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
  const inDsi = actor.department?.type === "DSI";

  if (actor.role !== "CEO" && actor.role !== "ACCOUNTANT" && !(canReadAsManager && inDsi)) {
    return jsonError("Accès refusé", 403);
  }

  const dsiDepartment = await prisma.department.findFirst({
    where: { type: "DSI" },
    select: { id: true },
  });

  if (!dsiDepartment) return NextResponse.json({ leaves: [] });

  const leaves = await prisma.leaveRequest.findMany({
    where: {
      status: { in: ["APPROVED", "REJECTED", "CANCELLED"] },
      employee: {
        departmentId: dsiDepartment.id,
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
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profilePhotoUrl: true,
          role: true,
          leaveBalance: true,
        },
      },
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
  });

  return NextResponse.json({ leaves });
}
