export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { jsonError } from "@/lib/auth";
import { norm } from "@/lib/validators";

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const firstName = norm(body?.firstName);
    const lastName = norm(body?.lastName);
    const email = norm(body?.email).toLowerCase();
    const matricule = norm(body?.matricule) || null;
    const password = norm(body?.password);
    const acceptedTerms = body?.acceptedTerms === true;

    if (!firstName || !lastName || !email || !password) {
      return jsonError("Champs requis: firstName, lastName, email, password", 400);
    }

    if (!isValidEmail(email)) {
      return jsonError("Email invalide", 400);
    }

    if (password.length < 6) {
      return jsonError("Mot de passe trop court (min 6)", 400);
    }
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
        message: "Compte créé. En attente de validation par l’admin (Responsable DSI).",
      },
      { status: 201 }
    );
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string; meta?: { target?: unknown } };
    // Prisma unique constraint
    if (err?.code === "P2002") {
      const target = Array.isArray(err?.meta?.target)
      ? err.meta.target.join(",")
      : String(err?.meta?.target ?? "");
      return jsonError("Email ou matricule déjà utilisé", 409, { target });
    }

    return jsonError("Erreur serveur", 500, { code: err?.code, details: err?.message });
  }
}
