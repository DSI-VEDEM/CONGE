export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt, jsonError } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

async function findTargetByRole(role: string, departmentId?: string | null) {
  if (role === "CEO") {
    return prisma.employee.findFirst({ where: { role: "CEO", status: "ACTIVE" }, select: { id: true, role: true } });
  }
  if (role === "ACCOUNTANT") {
    return prisma.employee.findFirst({ where: { role: "ACCOUNTANT", status: "ACTIVE" }, select: { id: true, role: true } });
  }
  if (role === "DSI") {
    const dsiDept = await prisma.department.findFirst({ where: { type: "DSI" }, select: { id: true } });
    if (!dsiDept?.id) return null;
    const resp = await prisma.departmentResponsibility.findFirst({
      where: {
        departmentId: dsiDept.id,
        endAt: null,
        role: { in: ["RESPONSABLE", "CO_RESPONSABLE"] },
      },
      select: { employeeId: true, employee: { select: { role: true } } },
    });
    return resp ? { id: resp.employeeId, role: resp.employee.role } : null;
  }
  if (role === "MANAGER") {
    if (!departmentId) return null;
    const resp = await prisma.departmentResponsibility.findFirst({
      where: {
        departmentId,
        endAt: null,
        role: { in: ["RESPONSABLE", "CO_RESPONSABLE"] },
      },
      select: { employeeId: true, employee: { select: { role: true } } },
    });
    return resp ? { id: resp.employeeId, role: resp.employee.role } : null;
  }
  return null;
}

export async function POST(req: Request, ctx: Ctx) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const params = await ctx.params;
  const id = params.id;

  const actorId = String(v.payload?.sub ?? "");
  if (!actorId) return jsonError("Token invalide", 401);

  const body = await req.json().catch(() => ({}));
  const type = body?.type as string | undefined;
  const decisionTypes = ["APPROVE", "REJECT", "ESCALATE", "CANCEL"] as const;
  const decisionType = decisionTypes.includes(type as any)
    ? (type as (typeof decisionTypes)[number])
    : null;
  const comment = body?.comment ?? null;
  const toEmployeeId = body?.toEmployeeId ?? null;
  const toRole = body?.toRole ?? null;

  if (!decisionType) {
    return jsonError("type invalide", 400);
  }

  const leave = await prisma.leaveRequest.findUnique({
    where: { id },
    select: {
      id: true,
      employeeId: true,
      currentAssigneeId: true,
      status: true,
      employee: { select: { departmentId: true } },
    },
  });

  if (!leave) return jsonError("Demande introuvable", 404);

  if (decisionType === "CANCEL") {
    if (leave.employeeId !== actorId) {
      return jsonError("Accès refusé", 403);
    }
  } else if (leave.currentAssigneeId !== actorId) {
    return jsonError("Accès refusé", 403);
  }

  let nextAssigneeId: string | null = null;
  let nextAssigneeRole: string | null = null;

  if (decisionType === "ESCALATE") {
    if (toEmployeeId) {
      const target = await prisma.employee.findUnique({
        where: { id: toEmployeeId },
        select: { id: true, role: true },
      });
      if (!target) return jsonError("Cible introuvable", 404);
      nextAssigneeId = target.id;
      nextAssigneeRole = target.role;
    } else if (toRole) {
      const target = await findTargetByRole(String(toRole), leave.employee?.departmentId ?? null);
      if (!target) return jsonError("Cible introuvable", 404);
      nextAssigneeId = target.id;
      nextAssigneeRole = target.role;
    } else {
      return jsonError("toEmployeeId ou toRole requis pour ESCALATE", 400);
    }
  }

  const updates: any = {};
  if (decisionType === "APPROVE") {
    updates.status = "APPROVED";
    updates.currentAssigneeId = null;
  }
  if (decisionType === "REJECT") {
    updates.status = "REJECTED";
    updates.currentAssigneeId = null;
  }
  if (decisionType === "CANCEL") {
    updates.status = "CANCELLED";
    updates.currentAssigneeId = null;
  }
  if (decisionType === "ESCALATE") {
    updates.status = "PENDING";
    updates.currentAssigneeId = nextAssigneeId;
    if (nextAssigneeRole === "CEO") updates.reachedCeoAt = new Date();
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedLeave = await tx.leaveRequest.update({
      where: { id },
      data: updates,
      select: {
        id: true,
        status: true,
        currentAssigneeId: true,
        reachedCeoAt: true,
      },
    });

    await tx.leaveDecision.create({
      data: {
        leaveRequestId: id,
        actorId,
        type: decisionType,
        comment,
        toEmployeeId: nextAssigneeId,
      },
    });

    return updatedLeave;
  });

  return NextResponse.json({ leave: updated });
}

