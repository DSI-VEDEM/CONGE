export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonServerError } from "@/lib/auth";
import { requireRoleOrDsiAdmin } from "@/lib/dsiAdmin";

type Ctx = { params: Promise<{ id: string; rid: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  // Clôture/modification d'une responsabilité : CEO ou admin DSI.
  const v = await requireRoleOrDsiAdmin(req, ["CEO"]);
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
  } catch (e: unknown) {
    console.error("[departments/:id/responsable/:rid] PATCH erreur", e);
    return jsonServerError(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  // Suppression d'une responsabilité : CEO ou admin DSI.
  const v = await requireRoleOrDsiAdmin(req, ["CEO"]);
  if (!v.ok) return v.error;

  const params = await ctx.params;
  const rid = params.rid;

  try {
    await prisma.departmentResponsibility.delete({ where: { id: rid } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[departments/:id/responsable/:rid] DELETE erreur", e);
    return jsonServerError(e);
  }
}
