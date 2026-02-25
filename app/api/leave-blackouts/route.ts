export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { requireAuth, parseDate } from "@/lib/leave-requests";
import { norm } from "@/lib/validators";

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

function normalizeEmployeeIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((v) => (v == null ? "" : String(v).trim()))
        .filter((v) => v.length > 0)
    )
  );
}

export async function GET(req: Request) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const { role } = authRes.auth;
  if (role !== "CEO") return jsonError("Accès refusé", 403);

  const supportsEmployeeIds = supportsLeaveBlackoutEmployeeIds();
  const items = await prisma.leaveBlackout.findMany({
    select: {
      id: true,
      title: true,
      reason: true,
      startDate: true,
      endDate: true,
      departmentId: true,
      ...(supportsEmployeeIds ? { employeeIds: true } : {}),
      department: { select: { id: true, type: true, name: true } },
      createdAt: true,
    },
    orderBy: { startDate: "desc" },
  });

  const employeeIds = Array.from(
    new Set(
      items.flatMap((item) => {
        const withTargets = item as typeof item & { employeeIds?: string[] | null };
        return withTargets.employeeIds ?? [];
      })
    )
  );

  const employees = employeeIds.length
    ? await prisma.employee.findMany({
        where: { id: { in: employeeIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          matricule: true,
          department: { select: { type: true, name: true } },
        },
      })
    : [];

  const employeeMap = new Map(employees.map((emp) => [emp.id, emp]));

  return NextResponse.json({
    blackouts: items.map((item) => ({
      ...item,
      targetEmployees: (item.employeeIds ?? [])
        .map((id) => employeeMap.get(id))
        .filter(Boolean),
    })),
  });
}

export async function POST(req: Request) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role } = authRes.auth;
  if (role !== "CEO") return jsonError("Accès refusé", 403);

  const body = await req.json().catch(() => ({}));
  const title = norm(body?.title) || null;
  const reason = norm(body?.reason) || null;
  const startDate = parseDate(body?.startDate);
  const endDate = parseDate(body?.endDate);
  const departmentId = body?.departmentId ? String(body.departmentId) : null;
  const employeeIds = normalizeEmployeeIds(body?.employeeIds);
  const supportsEmployeeIds = supportsLeaveBlackoutEmployeeIds();

  if (!startDate || !endDate) {
    return jsonError("Champs requis: startDate, endDate", 400);
  }
  if (startDate > endDate) {
    return jsonError("startDate doit être avant endDate", 400);
  }
  if (departmentId && employeeIds.length > 0) {
    return jsonError("Choisissez soit un département, soit des employés ciblés", 400);
  }
  if (employeeIds.length > 0 && !supportsEmployeeIds) {
    return jsonError("Mise à jour Prisma requise: relancez le serveur et exécutez `npx prisma db push`", 409);
  }

  if (departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
    if (!dept) return jsonError("Département invalide", 400);
  }
  if (employeeIds.length > 0) {
    const count = await prisma.employee.count({ where: { id: { in: employeeIds } } });
    if (count !== employeeIds.length) return jsonError("Liste d'employés invalide", 400);
  }

  const created = await prisma.leaveBlackout.create({
    data: {
      title,
      reason,
      startDate,
      endDate,
      departmentId,
      ...(supportsEmployeeIds ? { employeeIds } : {}),
      createdById: actorId,
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      departmentId: true,
      ...(supportsEmployeeIds ? { employeeIds: true } : {}),
    },
  });

  return NextResponse.json({ blackout: created }, { status: 201 });
}
