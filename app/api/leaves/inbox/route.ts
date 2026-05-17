export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt, jsonError } from "@/lib/auth";

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

export async function GET(req: Request) {
  // Inbox des congés assignés à l'utilisateur courant.
  // Sécurité : scopée par `currentAssigneeId` (un utilisateur ne voit que ses propres assignations).
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const employeeId = String(v.payload?.sub ?? "");
  if (!employeeId) return jsonError("Token invalide", 401);

  // Pagination : ?take=50 (max 200), ?skip=0
  const url = new URL(req.url);
  const takeRaw = Number(url.searchParams.get("take") ?? DEFAULT_TAKE);
  const skipRaw = Number(url.searchParams.get("skip") ?? 0);
  const take = Math.min(MAX_TAKE, Math.max(1, Number.isFinite(takeRaw) ? takeRaw : DEFAULT_TAKE));
  const skip = Math.max(0, Number.isFinite(skipRaw) ? skipRaw : 0);

  const where = {
    currentAssigneeId: employeeId,
    status: { in: ["SUBMITTED", "PENDING"] satisfies string[] as ("SUBMITTED" | "PENDING")[] },
  };

  const [leaves, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      select: {
        id: true,
        type: true,
        startDate: true,
        endDate: true,
        status: true,
        reason: true,
        employee: { select: { id: true, firstName: true, lastName: true, role: true } },
        currentAssigneeId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.leaveRequest.count({ where }),
  ]);

  return NextResponse.json({ leaves, total, take, skip });
}
