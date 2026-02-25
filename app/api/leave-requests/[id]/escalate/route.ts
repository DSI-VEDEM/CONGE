export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { requireAuth, isFinalStatus, findActiveEmployeeByRole } from "@/lib/leave-requests";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role } = authRes.auth;
  const { id } = await ctx.params;

  const leave = await prisma.leaveRequest.findUnique({
    where: { id },
    select: {
      id: true,
      employeeId: true,
      status: true,
      currentAssigneeId: true,
      employee: { select: { departmentId: true, role: true } },
    },
  });

  if (!leave) return jsonError("Demande introuvable", 404);
  if (isFinalStatus(leave.status)) return jsonError("Demande déjà traitée", 409);
  if (leave.currentAssigneeId !== actorId) return jsonError("Accès refusé", 403);
  if (leave.employeeId === actorId) return jsonError("Action interdite sur sa propre demande", 403);

  const body = await req.json().catch(() => ({}));
  const comment = body?.comment ?? null;
  const toRole = body?.toRole as string | undefined;

  let target = null;

  if (role === "ACCOUNTANT") {
    const requesterRole = leave.employee?.role ?? "EMPLOYEE";
    const isDirectorRequester = requesterRole === "DEPT_HEAD" || requesterRole === "SERVICE_HEAD";

    if (isDirectorRequester) {
      if (toRole && toRole !== "CEO") {
        return jsonError("toRole invalide (PDG uniquement pour les demandes de responsables)", 400);
      }
      target = await findActiveEmployeeByRole("CEO");
    } else {
      if (toRole && toRole !== "DEPT_HEAD" && toRole !== "CEO") {
        return jsonError("toRole invalide (DEPT_HEAD|PDG)", 400);
      }
      target =
        toRole === "CEO"
          ? await findActiveEmployeeByRole("CEO")
          : await findActiveEmployeeByRole("DEPT_HEAD", leave.employee?.departmentId ?? null);
    }
  } else if (role === "DEPT_HEAD") {
    if (toRole && toRole !== "SERVICE_HEAD" && toRole !== "CEO") {
      return jsonError("toRole invalide (SERVICE_HEAD|PDG)", 400);
    }
    if (toRole === "SERVICE_HEAD") {
      target = await findActiveEmployeeByRole("SERVICE_HEAD", leave.employee?.departmentId ?? null);
    } else {
      target = await findActiveEmployeeByRole("CEO");
    }
  } else if (role === "SERVICE_HEAD") {
    if (toRole && toRole !== "CEO") {
      return jsonError("toRole invalide (PDG uniquement)", 400);
    }
    target = await findActiveEmployeeByRole("CEO");
  } else {
    return jsonError("Accès refusé", 403);
  }

  if (!target) {
    return jsonError("Aucun assignataire actif disponible", 409);
  }
  if (target.id === actorId) {
    return jsonError("Action interdite sur sa propre demande", 403);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedLeave = await tx.leaveRequest.update({
      where: { id },
      data: {
        status: "PENDING",
        currentAssigneeId: target.id,
        deptHeadAssignedAt: target.role === "DEPT_HEAD" || target.role === "SERVICE_HEAD" ? new Date() : null,
        reachedCeoAt: target.role === "CEO" ? new Date() : null,
      },
      select: { id: true, status: true, currentAssigneeId: true },
    });

    await tx.leaveDecision.create({
      data: {
        leaveRequestId: id,
        actorId,
        type: "ESCALATE",
        comment,
        toEmployeeId: target.id,
      },
    });

    return updatedLeave;
  });

  return NextResponse.json({ leave: updated });
}
