export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt, jsonError, jsonServerError } from "@/lib/auth";
import { requireRoleOrDsiAdmin } from "@/lib/dsiAdmin";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const params = await ctx.params;
  const id = params.id;

  const service = await prisma.service.findUnique({
    where: { id },
    include: { department: true, members: true },
  });

  if (!service) return jsonError("Service introuvable", 404);
  return NextResponse.json({ service });
}

export async function PATCH(req: Request, ctx: Ctx) {
  // Modification d'un service : CEO ou admin DSI.
  const v = await requireRoleOrDsiAdmin(req, ["CEO"]);
  if (!v.ok) return v.error;

  const params = await ctx.params;
  const id = params.id;

  try {
    const body = await req.json().catch(() => ({}));

    const updated = await prisma.service.update({
      where: { id },
      data: {
        name: body?.name ? body.name : undefined,
        description: body?.description ? body.description : undefined,
      },
    });

    return NextResponse.json({ service: updated });
  } catch (e: unknown) {
    console.error("[services/:id] PATCH erreur", e);
    return jsonServerError(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  // Suppression d'un service : CEO ou admin DSI.
  const v = await requireRoleOrDsiAdmin(req, ["CEO"]);
  if (!v.ok) return v.error;

  const params = await ctx.params;
  const id = params.id;

  try {
    await prisma.service.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[services/:id] DELETE erreur", e);
    return jsonServerError(e);
  }
}
