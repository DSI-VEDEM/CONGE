export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt, jsonError } from "@/lib/auth";
import { isDsiAdmin } from "@/lib/dsiAdmin";
import { norm } from "@/lib/validators";

type Ctx = { params: Promise<{ id: string }> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function PATCH(req: Request, ctx: Ctx) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const adminId = String(v.payload?.sub ?? "");
  if (!adminId) return jsonError("Token invalide", 401);

  const ok = await isDsiAdmin(adminId);
  if (!ok) return jsonError("Accès refusé (admin DSI requis)", 403);

  const { id } = await ctx.params;
  if (!id) return jsonError("ID requis", 400);

  const current = await prisma.employee.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!current) return jsonError("Employé introuvable", 404);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const hasEmail = Object.prototype.hasOwnProperty.call(body, "email");
  const hasMatricule = Object.prototype.hasOwnProperty.call(body, "matricule");

  if (!hasEmail && !hasMatricule) {
    return jsonError("Aucun champ à modifier", 400);
  }

  const data: { email?: string; matricule?: string | null } = {};

  if (hasEmail) {
    const email = norm(body?.email).toLowerCase();
    if (!email || !EMAIL_RE.test(email)) return jsonError("email invalide", 400);

    const duplicate = await prisma.employee.findFirst({
      where: { email, id: { not: id } },
      select: { id: true },
    });
    if (duplicate) return jsonError("Cet email est déjà utilisé", 409);

    data.email = email;
  }

  if (hasMatricule) {
    const matricule = norm(body?.matricule) || null;

    if (matricule) {
      const duplicate = await prisma.employee.findFirst({
        where: { matricule, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) return jsonError("Ce matricule est déjà utilisé", 409);
    }

    data.matricule = matricule;
  }

  try {
    const updated = await prisma.employee.update({
      where: { id },
      data,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        profilePhotoUrl: true,
        email: true,
        matricule: true,
        jobTitle: true,
        role: true,
        status: true,
        createdAt: true,
        department: { select: { id: true, name: true, type: true } },
        service: { select: { id: true, name: true, type: true } },
      },
    });

    return NextResponse.json({ employee: updated });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "P2002") return jsonError("Email ou matricule déjà utilisé", 409);
    return jsonError("Erreur serveur", 500, { code: err?.code, details: err?.message });
  }
}
