export const runtime = "nodejs";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonServerError } from "@/lib/auth";
import { requireAuth } from "@/lib/leave-requests";
import { isDsiAdmin } from "@/lib/dsiAdmin";
import { norm } from "@/lib/validators";
import { sendEmail, isEmailEnabled } from "@/lib/email";
import { logError } from "@/lib/logger";
import type { NotificationCategory } from "@/generated/prisma/client";

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
  try {
    const authRes = requireAuth(req);
    if (!authRes.ok) return authRes.error;

    const actorId = authRes.auth.id;
    const actorIsAdmin = await isDsiAdmin(actorId);
    if (!actorIsAdmin) {
      return jsonError("Accès refusé (admin DSI requis)", 403);
    }

    // SMTP obligatoire : le mot de passe ne doit jamais être visible par l'admin.
    if (!isEmailEnabled()) {
      return jsonError(
        "La configuration SMTP est requise. Le mot de passe est généré aléatoirement et envoyé uniquement par email — aucun administrateur ne peut y accéder.",
        503
      );
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

    const temporaryPassword = generateTemporaryPassword(16);
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    const fullName = [target.firstName, target.lastName].filter(Boolean).join(" ").trim() || target.email;

    // Envoi d'abord — si l'email échoue, la DB n'est pas modifiée.
    await sendEmail({
      to: target.email,
      subject: "Réinitialisation de votre mot de passe — VDM Congés",
      text: `Bonjour ${fullName},

Votre mot de passe a été réinitialisé par un administrateur DSI.
Mot de passe temporaire : ${temporaryPassword}

Pour des raisons de sécurité, vous devrez le changer immédiatement à votre prochaine connexion.
Ce mot de passe n'est connu que de vous — aucun administrateur n'y a accès.

Si vous n'êtes pas à l'origine de cette demande, contactez immédiatement votre administrateur.`,
      html: `<p>Bonjour <strong>${fullName}</strong>,</p>
<p>Votre mot de passe a été réinitialisé par un administrateur DSI.</p>
<p>Mot de passe temporaire&nbsp;: <strong style="font-family:monospace;font-size:1.1em">${temporaryPassword}</strong></p>
<p>Pour des raisons de sécurité, vous devrez le changer immédiatement à votre prochaine connexion.<br>
Ce mot de passe n'est connu que de vous — aucun administrateur n'y a accès.</p>
<p style="color:#888">Si vous n'êtes pas à l'origine de cette demande, contactez immédiatement votre administrateur.</p>`,
    });

    // Email confirmé envoyé : mise à jour de la DB.
    const resetData: Record<string, unknown> = {
      password: hashedPassword,
      passwordResetRequested: false,
      mustChangePassword: true,
    };
    await prisma.employee.update({
      where: { id: employeeId },
      data: resetData as Parameters<typeof prisma.employee.update>[0]["data"],
    });

    await prisma.notification.create({
      data: {
        title: "Mot de passe réinitialisé",
        body: "Votre mot de passe a été réinitialisé. Consultez votre email pour récupérer votre mot de passe temporaire et changez-le immédiatement après connexion.",
        category: "INFO" as NotificationCategory,
        employeeId,
        targetRole: "EMPLOYEE",
        global: false,
        metadata: { adminId: actorId },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    logError("auth/reset-password", e, "erreur serveur");
    return jsonServerError(e);
  }
}
