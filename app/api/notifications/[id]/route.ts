export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, verifyJwt } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, ctx: Ctx) {
  const jwt = verifyJwt(req);
  if (!jwt.ok) return jwt.error;

  const employeeId = String(jwt.payload?.sub ?? "");
  if (!employeeId) return jsonError("Token invalide", 401);

  const { id } = await ctx.params;
  if (!id) return jsonError("Notification introuvable", 404);

  const notification = await prisma.notification.findUnique({
    where: { id },
    select: { id: true, employeeId: true, isRead: true },
  });
  if (!notification) return jsonError("Notification introuvable", 404);
  if (notification.employeeId !== employeeId) return jsonError("Accès refusé", 403);
  if (!notification.isRead) {
    return jsonError("Seules les notifications lues peuvent être supprimées", 400);
  }

  await prisma.notification.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
