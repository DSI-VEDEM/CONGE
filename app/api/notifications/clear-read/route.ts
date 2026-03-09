export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, verifyJwt } from "@/lib/auth";

export async function DELETE(req: Request) {
  const jwt = verifyJwt(req);
  if (!jwt.ok) return jwt.error;

  const employeeId = String(jwt.payload?.sub ?? "");
  if (!employeeId) return jsonError("Token invalide", 401);

  const deleted = await prisma.notification.deleteMany({
    where: { employeeId, isRead: true },
  });

  return NextResponse.json({ ok: true, deleted: deleted.count });
}
