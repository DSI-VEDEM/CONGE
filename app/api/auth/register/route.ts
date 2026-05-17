export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { jsonError, jsonServerError } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validate";
import { registerSchema } from "@/lib/schemas/auth.schema";
import { logError } from "@/lib/logger";

export async function POST(req: Request) {
  /// Endpoint d'inscription publique : crée un employé en statut pending.
  try {
    // Rate-limit : 5 inscriptions / 1 heure par IP
    const rl = rateLimit(req, { key: "auth:register", max: 5, windowMs: 60 * 60 * 1000 });
    if (!rl.ok) return rateLimitResponse(rl.resetAt);

    // Validation Zod (email, matricule, password length, CGU, etc.)
    const parsed = await parseBody(req, registerSchema);
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;
    const { firstName, lastName, email, matricule, password, jobTitle } = body;

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
        jobTitle: jobTitle ?? null,

        // role/status sont forcés côté serveur — on ignore tout body.role/status
        role: "EMPLOYEE",
        status: "PENDING",

        departmentId: body.departmentId ?? null,
        serviceId: body.serviceId ?? null,
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
    logError("auth/register", e, "erreur serveur lors de l'inscription");
    return jsonServerError(e);
  }
}
