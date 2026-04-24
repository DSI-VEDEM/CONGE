export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { requireAuth } from "@/lib/leave-requests";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, ctx: Ctx) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const { role, isDsiAdmin } = authRes.auth;
  if (role !== "ACCOUNTANT" && !isDsiAdmin) return jsonError("Accès refusé", 403);

  const { id } = await ctx.params;
  await prisma.holiday.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
