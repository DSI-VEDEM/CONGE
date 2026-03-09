export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { requireAuth } from "@/lib/leave-requests";

export async function POST(req: Request) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const employeeId = authRes.auth.id;

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, firstName: true, lastName: true, email: true, matricule: true },
  });
  if (!employee) {
    return jsonError("Employé introuvable", 404);
  }

  const dsiDepartment = await prisma.department.findFirst({
    where: { type: "DSI" },
    select: { id: true },
  });
  if (!dsiDepartment) {
    return NextResponse.json({ ok: true });
  }

  const adminHeads = await prisma.employee.findMany({
    where: {
      status: "ACTIVE",
      role: "DEPT_HEAD",
      departmentId: dsiDepartment.id,
    },
    select: { id: true },
  });

  const responsibles = await prisma.departmentResponsibility.findMany({
    where: {
      endAt: null,
      role: "RESPONSABLE",
      departmentId: dsiDepartment.id,
    },
    select: { employeeId: true },
  });

  const recipients = new Set(adminHeads.map((item) => item.id));
  responsibles.forEach((item) => recipients.add(item.employeeId));

  if (recipients.size > 0) {
    await prisma.employee.update({
      where: { id: employee.id },
      data: { passwordResetRequested: true },
    });
    const identifier = employee.email ?? employee.matricule ?? "ce collaborateur";
    const fullName = [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim() || identifier;
    const message = `${fullName} (${identifier}) a demandé la réinitialisation de son mot de passe. Merci de réinitialiser le compte et de lui attribuer le mot de passe par défaut.`;

    await prisma.notification.createMany({
      data: Array.from(recipients).map((adminId) => ({
        title: "Demande de réinitialisation",
        body: message,
        category: "ACTION" as const,
        employeeId: adminId,
        global: false,
        metadata: {
          employeeId: employee.id,
          identifier,
          requesterName: fullName,
          actionPath: "/dashboard/dsi/password-reset",
        },
      })),
    });
  }

  return NextResponse.json({ ok: true });
}
