export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt, jsonError } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const params = await ctx.params;
  const id = params.id;

  const responsables = await prisma.departmentResponsibility.findMany({
    where: { departmentId: id, endAt: null },
    include: { employee: true, supervisor: true },
    orderBy: { startAt: "desc" },
  });

  return NextResponse.json({ responsables });
}

export async function POST(req: Request, ctx: Ctx) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const params = await ctx.params;
  const id = params.id;

  try {
    const body = await req.json().catch(() => ({}));
    const employeeId = body?.employeeId;
    const role = body?.role ?? "RESPONSABLE";
    const supervisorId = body?.supervisorId ? String(body.supervisorId) : null;

    if (!employeeId) return jsonError("Champs requis: employeeId", 400);

    // Ici tu peux ajouter tes règles métier:
    // - DSI: max 1 responsable actif
    // - DAF: max 2 responsables actifs
    // (à faire côté code car Mongo/Prisma ne le force pas)
    const activeCount = await prisma.departmentResponsibility.count({
      where: { departmentId: id, endAt: null },
    });

    const dept = await prisma.department.findUnique({
      where: { id },
      select: { type: true },
    });

    if (!dept) return jsonError("Département introuvable", 404);

    const targetEmployee = await prisma.employee.findUnique({
      where: { id: String(employeeId) },
      select: { id: true, departmentId: true, role: true, status: true, serviceId: true },
    });
    if (!targetEmployee) return jsonError("Employé introuvable", 404);
    if (targetEmployee.departmentId !== id) {
      return jsonError("L'employé doit appartenir à ce département", 400);
    }

    if (dept.type === "OPERATIONS") {
      if (!supervisorId) {
        return jsonError("En OPERATIONS, supervisorId (Directeur Adjoint) est requis", 400);
      }

      const supervisor = await prisma.employee.findUnique({
        where: { id: supervisorId },
        select: { id: true, departmentId: true, role: true, status: true, serviceId: true },
      });
      if (!supervisor) return jsonError("Directeur Adjoint introuvable", 404);
      if (supervisor.departmentId !== id || supervisor.role !== "SERVICE_HEAD" || supervisor.status !== "ACTIVE") {
        return jsonError("supervisorId invalide: doit être un Directeur Adjoint actif du département", 400);
      }

      if (targetEmployee.serviceId && supervisor.serviceId && targetEmployee.serviceId !== supervisor.serviceId) {
        return jsonError("Le responsable doit dépendre du même service que son Directeur Adjoint", 400);
      }

      const activeUnderSupervisor = await prisma.departmentResponsibility.count({
        where: { departmentId: id, endAt: null, supervisorId: supervisor.id },
      });
      if (activeUnderSupervisor >= 3) {
        return jsonError("Un Directeur Adjoint peut superviser au maximum 3 responsables actifs", 409);
      }
    }

    if (dept.type === "DSI" && activeCount >= 1) {
      return jsonError("DSI: 1 responsable actif maximum", 409);
    }
    if (dept.type === "DAF" && activeCount >= 2) {
      return jsonError("DAF: 2 responsables actifs maximum", 409);
    }

    const created = await prisma.departmentResponsibility.create({
      data: {
        departmentId: id,
        employeeId,
        role,
        supervisorId: dept.type === "OPERATIONS" ? supervisorId : null,
      },
    });

    return NextResponse.json({ responsibility: created }, { status: 201 });
  } catch (e: any) {
    return jsonError("Erreur serveur", 500, { code: e?.code, details: e?.message });
  }
}
