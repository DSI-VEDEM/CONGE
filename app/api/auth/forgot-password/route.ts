export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { norm } from "@/lib/validators";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const identifier = norm(body?.identifier);

    if (!identifier) {
      return jsonError("Champs requis: identifier", 400);
    }

    // Recherche sans divulguer si le compte existe
    await prisma.employee.findFirst({
      where: { OR: [{ email: identifier }, { matricule: identifier }] },
      select: { id: true },
    });

    // TODO: brancher l'envoi d'email + token de reinitialisation
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return jsonError("Erreur serveur", 500, { code: e?.code, details: e?.message });
  }
}
