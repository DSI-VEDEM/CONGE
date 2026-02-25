export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/leave-requests";

function supportsLeaveBlackoutEmployeeIds() {
  const client = prisma as unknown as {
    _runtimeDataModel?: {
      models?: Record<string, { fields?: Array<{ name?: string }> }>;
    };
  };
  const fields = client._runtimeDataModel?.models?.LeaveBlackout?.fields;
  if (!Array.isArray(fields)) return false;
  return fields.some((f: { name?: string }) => f?.name === "employeeIds");
}

function appliesToEmployee(
  blackout: { departmentId?: string | null; employeeIds?: string[] | null },
  employee: { id: string; departmentId?: string | null }
) {
  const targetIds = Array.isArray(blackout.employeeIds) ? blackout.employeeIds : [];
  if (targetIds.includes(employee.id)) return true;
  if (blackout.departmentId && employee.departmentId && blackout.departmentId === employee.departmentId) return true;
  return !blackout.departmentId && targetIds.length === 0;
}

export async function GET(req: Request) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const { id: employeeId, role, departmentId } = authRes.auth;
  const supportsEmployeeIds = supportsLeaveBlackoutEmployeeIds();
  const allBlackouts = await prisma.leaveBlackout.findMany({
    select: {
      id: true,
      startDate: true,
      endDate: true,
      departmentId: true,
      ...(supportsEmployeeIds ? { employeeIds: true } : {}),
    },
    orderBy: { startDate: "asc" },
  });
  const blackouts =
    role === "CEO"
      ? allBlackouts
      : allBlackouts.filter((b) => appliesToEmployee(b, { id: employeeId, departmentId }));

  if (role !== "CEO") {
    return NextResponse.json({ leaves: [], blackouts });
  }

  const leaves = await prisma.leaveRequest.findMany({
    where: { status: "APPROVED" },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      employee: {
        select: {
          firstName: true,
          lastName: true,
          matricule: true,
          department: { select: { type: true, name: true } },
        },
      },
    },
    orderBy: { startDate: "asc" },
  });

  return NextResponse.json({ leaves, blackouts });
}
