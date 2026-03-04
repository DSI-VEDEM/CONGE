export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt, jsonError } from "@/lib/auth";

export async function GET(req: Request) {
  // Liste des services avec leur département et le nombre de membres.
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const services = await prisma.service.findMany({
    include: { department: true, _count: { select: { members: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ services });
}

export async function POST(req: Request) {
  // Créé un service lié à un département.
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  try {
    const body = await req.json().catch(() => ({}));

    // Ces champs sont obligatoires pour respecter l'enum ServiceType et la relation.
    if (!body?.departmentId || !body?.type || !body?.name) {
      return jsonError("Champs requis: departmentId, type, name", 400);
    }

    const created = await prisma.service.create({
      data: {
        departmentId: body.departmentId,
        type: body.type, // enum ServiceType
        name: body.name,
        description: body?.description ?? null,
      },
    });

    return NextResponse.json({ service: created }, { status: 201 });
  } catch (e: any) {
    return jsonError("Erreur serveur", 500, { code: e?.code, details: e?.message });
  }
}
