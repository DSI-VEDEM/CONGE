export const runtime = "nodejs";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { requireAuth } from "@/lib/leave-requests";
import { isDsiAdmin } from "@/lib/dsiAdmin";
import { norm } from "@/lib/validators";
import type { NotificationCategory } from "@/generated/prisma/client";

export async function POST(req: Request) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const actorId = authRes.auth.id;
  const actorIsAdmin = await isDsiAdmin(actorId);
  if (!actorIsAdmin) {
    return jsonError("Accès refusé (admin DSI requis)", 403);
  }

  const body = await req.json().catch(() => ({}));
  const employeeId = norm(body?.employeeId);
  if (!employeeId) {
    return jsonError("Champs requis: employeeId", 400);
  }

  const target = await prisma.employee.findUnique({
    where: { id: employeeId },
  });
  if (!target) {
    return jsonError("Employé introuvable", 404);
  }

  const defaultPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  await prisma.employee.update({
    where: { id: employeeId },
    data: { password: hashedPassword, passwordResetRequested: false },
  });
  await prisma.employee.update({
    where: { id: employeeId },
    data: { passwordResetRequested: false },
  });

  await prisma.notification.create({
    data: {
      title: "Mot de passe réinitialisé",
      body: "Votre mot de passe a été réinitialisé par un administrateur DSI. Connectez-vous avec le mot de passe par défaut puis changez-le immédiatement.",
      category: "INFO" as NotificationCategory,
      employeeId,
      targetRole: "EMPLOYEE",
      global: false,
      metadata: {
        adminId: actorId,
      },
    },
  });

  return NextResponse.json({ ok: true });
}
