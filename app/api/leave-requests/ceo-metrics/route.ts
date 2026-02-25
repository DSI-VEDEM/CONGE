export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { requireAuth } from "@/lib/leave-requests";

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfNextMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export async function GET(req: Request) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const { role } = authRes.auth;
  if (role !== "CEO") return jsonError("Accès refusé", 403);

  const now = new Date();
  const from = startOfMonth(now);
  const to = startOfNextMonth(now);

  const escalatedPending = await prisma.leaveRequest.count({
    where: {
      reachedCeoAt: { not: null },
      status: { in: ["SUBMITTED", "PENDING"] },
    },
  });

  const decisionsThisMonth = await prisma.leaveDecision.count({
    where: {
      type: { in: ["APPROVE", "REJECT"] },
      createdAt: { gte: from, lt: to },
    },
  });

  const decisions = await prisma.leaveDecision.findMany({
    where: {
      type: { in: ["APPROVE", "REJECT"] },
      createdAt: { gte: from, lt: to },
    },
    select: {
      createdAt: true,
      leaveRequest: { select: { reachedCeoAt: true } },
    },
  });

  let totalMs = 0;
  let count = 0;
  for (const d of decisions) {
    const reached = d.leaveRequest?.reachedCeoAt ?? null;
    if (!reached) continue;
    const delta = d.createdAt.getTime() - reached.getTime();
    if (delta < 0) continue;
    totalMs += delta;
    count += 1;
  }

  const avgDecisionDelayDays = count > 0 ? totalMs / count / (24 * 60 * 60 * 1000) : null;

  return NextResponse.json({
    escalatedPending,
    decisionsThisMonth,
    avgDecisionDelayDays,
  });
}
