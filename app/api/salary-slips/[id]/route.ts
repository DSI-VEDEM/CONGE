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

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authRes = authFromRequest(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role } = authRes.auth;
  const { id } = await ctx.params;

  const slip = await prisma.salarySlip.findUnique({
    where: { id },
    select: {
      id: true,
      employeeId: true,
      year: true,
      month: true,
      fileName: true,
      mimeType: true,
      fileDataUrl: true,
      signedAt: true,
      signatureImageDataUrl: true,
      signatureImageMimeType: true,
      createdAt: true,
      employee: { select: { firstName: true, lastName: true, matricule: true, email: true } },
      signedBy: { select: { firstName: true, lastName: true, role: true } },
    },
  });

  if (!slip) return jsonError("Bulletin introuvable", 404);

  const isPrivileged = role === "ACCOUNTANT" || role === "CEO";
  const isOwner = slip.employeeId === actorId;

  if (!isPrivileged && !isOwner) {
    return jsonError("Accès refusé", 403);
  }

  if (isOwner && !isPrivileged && !slip.signedAt) {
    return jsonError("Le bulletin n'est pas encore signé par le PDG", 403);
  }

  return NextResponse.json({ slip });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authRes = authFromRequest(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role } = authRes.auth;
  if (role !== "ACCOUNTANT") {
    return jsonError("Seule la comptable peut retirer un bulletin", 403);
  }

  const { id } = await ctx.params;

  const slip = await prisma.salarySlip.findUnique({
    where: { id },
    select: {
      id: true,
      signedAt: true,
      uploadedById: true,
    },
  });

  if (!slip) return jsonError("Bulletin introuvable", 404);
  if (slip.signedAt) {
    return jsonError("Impossible de retirer un bulletin déjà signé", 409);
  }
  if (slip.uploadedById !== actorId) {
    return jsonError("Vous ne pouvez retirer que vos propres imports", 403);
  }

  await prisma.salarySlip.delete({ where: { id } });
  return NextResponse.json({ ok: true }, { status: 200 });
}
