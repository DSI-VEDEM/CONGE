export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt, jsonError } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string; rid: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const params = await ctx.params;
  const rid = params.rid;

  try {
    const body = await req.json().catch(() => ({}));

    const updated = await prisma.departmentResponsibility.update({
      where: { id: rid },
      data: {
        endAt: body?.endAt ? new Date(body.endAt) : new Date(), // par défaut: maintenant
      },
    });

    return NextResponse.json({ responsibility: updated });
  } catch (e: any) {
    return jsonError("Erreur serveur", 500, { code: e?.code, details: e?.message });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const params = await ctx.params;
  const rid = params.rid;

  try {
    await prisma.departmentResponsibility.delete({ where: { id: rid } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return jsonError("Erreur serveur", 500, { code: e?.code, details: e?.message });
  }
}
