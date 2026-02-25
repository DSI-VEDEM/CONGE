export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { requireAuth } from "@/lib/leave-requests";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, ctx: Ctx) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const { role } = authRes.auth;
  if (role !== "CEO") return jsonError("Accès refusé", 403);

  const { id } = await ctx.params;
  if (!id) return jsonError("ID requis", 400);

  await prisma.leaveBlackout.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

