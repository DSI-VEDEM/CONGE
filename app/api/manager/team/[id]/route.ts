export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt, jsonError } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, ctx: Ctx) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const params = await ctx.params;
  const id = params.id;

  const managerId = String(v.payload?.sub ?? "");
  if (!managerId) return jsonError("Token invalide", 401);

  const manager = await prisma.employee.findUnique({
    where: { id: managerId },
    select: { id: true, role: true, departmentId: true, serviceId: true },
  });

  if (!manager || manager.role !== "SERVICE_HEAD") {
    return jsonError("Accès refusé", 403);
  }

  const target = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, departmentId: true, serviceId: true },
  });

  if (!target) return jsonError("Employé introuvable", 404);

  if (!manager.serviceId) {
    return jsonError("Manager sans département/service", 400);
  }
  if (target.serviceId !== manager.serviceId) return jsonError("Accès refusé", 403);
  await prisma.employee.update({
    where: { id: target.id },
    data: { serviceId: null },
  });

  return NextResponse.json({ ok: true });
}
