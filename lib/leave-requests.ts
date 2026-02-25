import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, verifyJwt } from "@/lib/auth";

type Auth = { id: string; role: string; departmentId?: string | null };

export function requireAuth(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return { ok: false as const, error: v.error };

  const id = String(v.payload?.sub ?? "");
  if (!id) return { ok: false as const, error: jsonError("Token invalide", 401) };

  const role = String(v.payload?.role ?? "");
  const departmentId = v.payload?.departmentId ?? null;
  return { ok: true as const, auth: { id, role, departmentId } };
}

export function isFinalStatus(status: string) {
  return status === "APPROVED" || status === "REJECTED" || status === "CANCELLED";
}

export async function findActiveEmployeeByRole(role: string, departmentId?: string | null) {
  return prisma.employee.findFirst({
    where: {
      role: role as any,
      status: "ACTIVE",
      ...(departmentId ? { departmentId } : {}),
    },
    select: { id: true, role: true, departmentId: true },
  });
}

export async function autoApproveOverdueForDeptHead(deptHeadId: string, days: number) {
  if (!Number.isFinite(days) || days <= 0) return 0;

  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const overdue = await prisma.leaveRequest.findMany({
    where: {
      currentAssigneeId: deptHeadId,
      status: { in: ["SUBMITTED", "PENDING"] },
      deptHeadAssignedAt: { lt: cutoff },
    },
    select: { id: true },
  });

  if (overdue.length === 0) return 0;

  const ops = overdue.flatMap((leave) => [
    prisma.leaveRequest.update({
      where: { id: leave.id },
      data: {
        status: "APPROVED",
        currentAssigneeId: null,
        deptHeadAssignedAt: null,
      },
    }),
    prisma.leaveDecision.create({
      data: {
        leaveRequestId: leave.id,
        actorId: deptHeadId,
        type: "APPROVE",
        comment: "Auto-approval after DEPT_HEAD/SERVICE_HEAD validation delay",
      },
    }),
  ]);

  await prisma.$transaction(ops);

  return overdue.length;
}

export function parseDate(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}
