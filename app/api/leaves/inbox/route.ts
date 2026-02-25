export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt, jsonError } from "@/lib/auth";

export async function GET(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const employeeId = String(v.payload?.sub ?? "");
  if (!employeeId) return jsonError("Token invalide", 401);

  const leaves = await prisma.leaveRequest.findMany({
    where: {
      currentAssigneeId: employeeId,
      status: { in: ["SUBMITTED", "PENDING"] },
    },
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
  });

  return NextResponse.json({ leaves });
}