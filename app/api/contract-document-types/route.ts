export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, verifyJwt } from "@/lib/auth";
import { norm } from "@/lib/validators";

function authFromRequest(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return { ok: false as const, error: v.error };

  const id = String(v.payload?.sub ?? "");
  const role = String(v.payload?.role ?? "");
  if (!id || !role) return { ok: false as const, error: jsonError("Token invalide", 401) };

  return { ok: true as const, auth: { id, role } };
}

export async function GET(req: Request) {
  const authRes = authFromRequest(req);
  if (!authRes.ok) return authRes.error;

  const types = await prisma.contractDocumentType.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ types });
}

export async function POST(req: Request) {
  const authRes = authFromRequest(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role } = authRes.auth;
  if (role !== "ACCOUNTANT") {
    return jsonError("Accès refusé", 403);
  }

  const body = await req.json().catch(() => ({}));
  const name = norm(body?.name);
  if (!name) {
    return jsonError("Le nom est requis", 400);
  }

  const existing = await prisma.contractDocumentType.findFirst({
    where: { name },
    select: { id: true },
  });
  if (existing) {
    return jsonError("Ce type existe déjà", 409);
  }

  const created = await prisma.contractDocumentType.create({
    data: {
      name,
      createdById: actorId,
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ type: created }, { status: 201 });
}
