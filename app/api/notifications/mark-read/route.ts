export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, verifyJwt } from "@/lib/auth";

export async function PATCH(req: Request) {
  const jwt = verifyJwt(req);
  if (!jwt.ok) return jwt.error;

  const employeeId = String(jwt.payload?.sub ?? "");
  if (!employeeId) return jsonError("Token invalide", 401);

  const body = await req.json().catch(() => ({}));
  const markAll = Boolean(body?.markAll);
  const rawIds = Array.isArray(body?.notificationIds) ? body.notificationIds : [];
  const notificationIds = rawIds.map((id) => String(id).trim()).filter(Boolean);

  if (!markAll && notificationIds.length === 0) {
    return jsonError("notificationIds requis ou markAll=true", 400);
  }

  const where =
    markAll || notificationIds.length === 0
      ? { employeeId, isRead: false }
      : { employeeId, isRead: false, id: { in: notificationIds } };

  const updated = await prisma.notification.updateMany({
    where,
    data: { isRead: true },
  });

  return NextResponse.json({ ok: true, updated: updated.count });
}
