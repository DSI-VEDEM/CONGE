export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, verifyJwt } from "@/lib/auth";

export async function GET(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const actorId = String(v.payload?.sub ?? "");
  if (!actorId) return jsonError("Token invalide", 401);

  const actor = await prisma.employee.findUnique({
    where: { id: actorId },
    select: { role: true },
  });

  if (!actor) return jsonError("Employé introuvable", 404);
  if (actor.role !== "CEO") return jsonError("Accès refusé", 403);

  const othersDepartment = await prisma.department.findFirst({
    where: { type: "OTHERS" },
    select: { id: true },
  });

  if (!othersDepartment) return NextResponse.json({ employees: [] });

  const employees = await prisma.employee.findMany({
    where: {
      departmentId: othersDepartment.id,
      id: { not: actorId },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      profilePhotoUrl: true,
      matricule: true,
      jobTitle: true,
      role: true,
      status: true,
      departmentId: true,
      serviceId: true,
      department: { select: { id: true, name: true, type: true } },
      service: { select: { id: true, name: true, type: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ employees });
}
