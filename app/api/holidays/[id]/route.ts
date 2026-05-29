export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { requireAuth } from "@/lib/leave-requests";
import { actorHasDafPermission } from "@/lib/daf-delegation";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, ctx: Ctx) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role, isDsiAdmin } = authRes.auth;
  const canManage = role === "ACCOUNTANT" || Boolean(isDsiAdmin) || (await actorHasDafPermission(actorId, "holidays"));
  if (!canManage) return jsonError("Accès refusé", 403);

  const { id } = await ctx.params;
  await prisma.holiday.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
