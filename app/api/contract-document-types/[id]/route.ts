export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, verifyJwt } from "@/lib/auth";

function authFromRequest(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return { ok: false as const, error: v.error };

  const id = String(v.payload?.sub ?? "");
  const role = String(v.payload?.role ?? "");
  if (!id || !role) return { ok: false as const, error: jsonError("Token invalide", 401) };

  return { ok: true as const, auth: { id, role } };
}

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, ctx: Ctx) {
  const authRes = authFromRequest(req);
  if (!authRes.ok) return authRes.error;

  const { role } = authRes.auth;
  if (role !== "ACCOUNTANT") {
    return jsonError("Accès refusé", 403);
  }

  const { id } = await ctx.params;
  if (!id) return jsonError("ID du type requis", 400);

  const existing = await prisma.contractDocumentType.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return jsonError("Type introuvable", 404);

  await prisma.contractDocumentType.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
