export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { jsonError, jsonServerError } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { norm } from "@/lib/validators";

/// Valide grossièrement la structure d'une adresse email côté serveur.
function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function POST(req: Request) {
  /// Endpoint d'inscription publique : crée un employé en statut pending.
  try {
    // Rate-limit : 5 inscriptions / 1 heure par IP
    const rl = rateLimit(req, { key: "auth:register", max: 5, windowMs: 60 * 60 * 1000 });
    if (!rl.ok) return rateLimitResponse(rl.resetAt);

    const body = await req.json().catch(() => ({}));

    const firstName = norm(body?.firstName);
    const lastName = norm(body?.lastName);
    const email = norm(body?.email).toLowerCase();
    const matricule = norm(body?.matricule) || null;
    const password = norm(body?.password);
    const acceptedTerms = body?.acceptedTerms === true;

    // Vérifications minimales de présence
    if (!firstName || !lastName || !email || !password || !matricule) {
      return jsonError("Champs requis: firstName, lastName, email, password, matricule", 400);
    }

    // Politique simple : email doit contenir @ et domaine
    if (!isValidEmail(email)) {
      return jsonError("Email invalide", 400);
    }

    // Mots de passe trop courts interdits
    if (password.length < 8) {
      return jsonError("Mot de passe trop court (min 8)", 400);
    }
    // Acceptation obligatoire des CGU
    if (!acceptedTerms) {
      return jsonError("Vous devez accepter les conditions d'utilisation", 400);
    }

    const hashed = await bcrypt.hash(password, 10);

    // IMPORTANT: on force role/status côté serveur
    // - role: EMPLOYEE (par défaut)
    // - status: PENDING (validation obligatoire par l’admin DSI)
    // On ignore volontairement tout body.role/status.
    const created = await prisma.employee.create({
      data: {
        firstName,
        lastName,
        email,
        matricule,
        password: hashed,
        jobTitle: body?.jobTitle ?? null,

        role: "EMPLOYEE",
        status: "PENDING",

        departmentId: body?.departmentId ?? null,
        serviceId: body?.serviceId ?? null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        matricule: true,
        role: true,
        status: true,
        departmentId: true,
        serviceId: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        employee: created,
        message: "Compte créé. En attente de validation par l’admin.",
      },
      { status: 201 }
    );
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string; meta?: { target?: unknown } };
    // Prisma unique constraint — l'info "email ou matricule déjà utilisé"
    // est ici nécessaire à l'UX. Pour éviter d'énumérer, on garde un libellé volontairement flou.
    if (err?.code === "P2002") {
      return jsonError("Email ou matricule déjà utilisé", 409);
    }
    console.error("[auth/register] erreur serveur", e);
    return jsonServerError(e);
  }
}
