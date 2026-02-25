export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { requireAuth, isFinalStatus } from "@/lib/leave-requests";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role } = authRes.auth;
  const { id } = await ctx.params;

  const leave = await prisma.leaveRequest.findUnique({
    where: { id },
    select: { id: true, employeeId: true, status: true, currentAssigneeId: true, reachedCeoAt: true },
  });

  if (!leave) return jsonError("Demande introuvable", 404);
  if (isFinalStatus(leave.status)) return jsonError("Demande déjà traitée", 409);
  if (leave.currentAssigneeId !== actorId) {
    const ceoCanAct = role === "CEO" && !!leave.reachedCeoAt;
    if (!ceoCanAct) return jsonError("Accès refusé", 403);
  }
  if (leave.employeeId === actorId) return jsonError("Action interdite sur sa propre demande", 403);

  const body = await req.json().catch(() => ({}));
  const comment = body?.comment ?? null;

  const updated = await prisma.$transaction(async (tx) => {
    const updatedLeave = await tx.leaveRequest.update({
      where: { id },
      data: { status: "REJECTED", currentAssigneeId: null, deptHeadAssignedAt: null },
      select: { id: true, status: true, currentAssigneeId: true },
    });

    await tx.leaveDecision.create({
      data: {
        leaveRequestId: id,
        actorId,
        type: "REJECT",
        comment,
      },
    });

    return updatedLeave;
  });

  return NextResponse.json({ leave: updated });
}
