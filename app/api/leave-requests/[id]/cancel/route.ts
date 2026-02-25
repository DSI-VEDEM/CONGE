export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { requireAuth } from "@/lib/leave-requests";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId } = authRes.auth;
  const { id } = await ctx.params;

  const leave = await prisma.leaveRequest.findUnique({
    where: { id },
    select: { id: true, employeeId: true, status: true },
  });

  if (!leave) return jsonError("Demande introuvable", 404);
  if (leave.employeeId !== actorId) return jsonError("Accès refusé", 403);
  if (!["SUBMITTED", "PENDING"].includes(leave.status)) {
    return jsonError("Annulation impossible (statut final)", 409);
  }

  const body = await req.json().catch(() => ({}));
  const comment = body?.comment ?? null;

  const updated = await prisma.$transaction(async (tx) => {
    const updatedLeave = await tx.leaveRequest.update({
      where: { id },
      data: { status: "CANCELLED", currentAssigneeId: null, deptHeadAssignedAt: null },
      select: { id: true, status: true, currentAssigneeId: true },
    });

    await tx.leaveDecision.create({
      data: {
        leaveRequestId: id,
        actorId,
        type: "CANCEL",
        comment,
      },
    });

    return updatedLeave;
  });

  return NextResponse.json({ leave: updated });
}
