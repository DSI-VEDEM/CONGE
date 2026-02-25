export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { requireAuth } from "@/lib/leave-requests";

export async function GET(req: Request) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const { role } = authRes.auth;
  if (role !== "CEO") return jsonError("Accès refusé", 403);

  const now = new Date();
  const leaves = await prisma.leaveRequest.findMany({
    where: {
      status: "APPROVED",
      startDate: { lte: now },
      endDate: { gte: now },
    },
    select: {
      employee: { select: { departmentId: true } },
    },
  });

  const counts: Record<string, number> = {};
  for (const leave of leaves) {
    const deptId = leave.employee?.departmentId ?? "NONE";
    counts[deptId] = (counts[deptId] ?? 0) + 1;
  }

  const departments = await prisma.department.findMany({
    select: { id: true, type: true, name: true },
  });

  const result = departments.map((d) => ({
    departmentId: d.id,
    departmentType: d.type,
    departmentName: d.name,
    count: counts[d.id] ?? 0,
  }));

  return NextResponse.json({ counts: result });
}
