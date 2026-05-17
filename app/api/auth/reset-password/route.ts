export const runtime = "nodejs";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonServerError } from "@/lib/auth";
import { requireAuth } from "@/lib/leave-requests";
import { isDsiAdmin } from "@/lib/dsiAdmin";
import { norm } from "@/lib/validators";
import { sendEmail } from "@/lib/email";
import type { NotificationCategory } from "@/generated/prisma/client";

/// Génère un mot de passe temporaire à 16 caractères, alphanumérique + symboles sûrs.
function generateTemporaryPassword(length = 16): string {
  // Alphabet sans caractères ambigus (0/O, 1/l/I)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*?";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export async function POST(req: Request) {
  /// Réinitialise le mot de passe d'un employé : génère un mot de passe aléatoire,
  /// l'envoie par email, et force le changement à la prochaine connexion.
  try {
    const authRes = requireAuth(req);
    if (!authRes.ok) return authRes.error;

    const actorId = authRes.auth.id;
    const actorIsAdmin = await isDsiAdmin(actorId);
    if (!actorIsAdmin) {
      return jsonError("Accès refusé (admin DSI requis)", 403);
    }

    const body = await req.json().catch(() => ({}));
    const employeeId = norm(body?.employeeId);
    if (!employeeId) {
      return jsonError("Champs requis: employeeId", 400);
    }

    const target = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!target) {
      return jsonError("Employé introuvable", 404);
    }

    // Génère un mot de passe aléatoire fort, le hache et stocke
    const temporaryPassword = generateTemporaryPassword(16);
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    // Le champ `mustChangePassword` a été ajouté au schéma Prisma.
    // Lance `npx prisma generate` après pull pour mettre à jour les types,
    // puis supprime le cast ci-dessous.
    const resetData: Record<string, unknown> = {
      password: hashedPassword,
      passwordResetRequested: false,
      mustChangePassword: true,
    };
    await prisma.employee.update({
      where: { id: employeeId },
      data: resetData as Parameters<typeof prisma.employee.update>[0]["data"],
    });

    // Envoi du mot de passe temporaire à l'employé par email (canal hors application).
    // Si SMTP n'est pas configuré, sendEmail ne fait rien — un admin devra communiquer le mot de passe.
    const fullName = [target.firstName, target.lastName].filter(Boolean).join(" ").trim() || target.email;
    const emailText = `Bonjour ${fullName},

Votre mot de passe a été réinitialisé par un administrateur DSI.
Mot de passe temporaire : ${temporaryPassword}

Pour des raisons de sécurité, vous devrez le changer immédiatement à votre prochaine connexion.

Si vous n'êtes pas à l'origine de cette demande, contactez immédiatement votre administrateur.`;

    try {
      await sendEmail({
        to: target.email,
        subject: "Réinitialisation de votre mot de passe",
        text: emailText,
      });
    } catch (mailErr) {
      // L'envoi d'email peut échouer (SMTP down) : on log et on continue.
      // L'admin saura que le mot de passe doit être communiqué autrement.
      console.error("[auth/reset-password] envoi email échoué", mailErr);
    }

    await prisma.notification.create({
      data: {
        title: "Mot de passe réinitialisé",
        body: "Votre mot de passe a été réinitialisé par un administrateur DSI. Consultez votre email pour récupérer le mot de passe temporaire, puis changez-le immédiatement après connexion.",
        category: "INFO" as NotificationCategory,
        employeeId,
        targetRole: "EMPLOYEE",
        global: false,
        metadata: {
          adminId: actorId,
        },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[auth/reset-password] erreur serveur", e);
    return jsonServerError(e);
  }
}
