export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt, jsonError } from "@/lib/auth";
import { norm } from "@/lib/validators";

export async function GET(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const departments = await prisma.department.findMany({
    select: {
      id: true,
      type: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { members: true, services: true, responsables: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ departments });
}

export async function POST(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  try {
    const body = await req.json().catch(() => ({}));
    const type = norm(body?.type);
    const name = norm(body?.name);

    if (!type || !name) return jsonError("Champs requis: type, name", 400);

    const created = await prisma.department.create({
      data: {
        type: body.type,
        name,
        description: body?.description ?? null,
      },
    });

    return NextResponse.json({ department: created }, { status: 201 });
  } catch (e: any) {
    return jsonError("Erreur serveur", 500, { code: e?.code, details: e?.message });
  }
}