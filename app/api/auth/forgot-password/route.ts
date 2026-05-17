export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonServerError } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validate";
import { forgotPasswordSchema } from "@/lib/schemas/auth.schema";
import { logError } from "@/lib/logger";

export async function POST(req: Request) {
  /// Page de demande d'oubli de mot de passe : on ne révèle pas si l'utilisateur existe.
  try {
    // Rate-limit : 5 demandes / 30 min par IP
    const rl = rateLimit(req, { key: "auth:forgot", max: 5, windowMs: 30 * 60 * 1000 });
    if (!rl.ok) return rateLimitResponse(rl.resetAt);

    const parsed = await parseBody(req, forgotPasswordSchema);
    if (!parsed.ok) return parsed.error;
    const { identifier } = parsed.data;

    // Recherche sans divulguer si le compte existe
    const employee = await prisma.employee.findFirst({
      where: { OR: [{ email: identifier }, { matricule: identifier }] },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (employee) {
      const dsiDepartment = await prisma.department.findFirst({
        where: { type: "DSI" },
        select: { id: true },
      });
      if (!dsiDepartment) return NextResponse.json({ ok: true });

      const adminIds = await prisma.employee.findMany({
        where: {
          status: "ACTIVE",
          role: "DEPT_HEAD",
          departmentId: dsiDepartment.id,
        },
        select: { id: true },
      });

      const responsibles = await prisma.departmentResponsibility.findMany({
        where: {
          endAt: null,
          role: "RESPONSABLE",
          departmentId: dsiDepartment.id,
        },
        select: { employeeId: true },
      });

      const recipients = new Set(adminIds.map((item) => item.id));
      responsibles.forEach((item) => recipients.add(item.employeeId));

      if (recipients.size > 0) {
        await prisma.employee.update({
          where: { id: employee.id },
          data: { passwordResetRequested: true },
        });
        const fullName =
          [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim() || identifier;
        const message = `${fullName} (${identifier}) a demandé la réinitialisation de son mot de passe. Merci de réinitialiser le compte et de lui attribuer le mot de passe par défaut.`;

        await prisma.notification.createMany({
          data: Array.from(recipients).map((adminId) => ({
            title: "Demande de réinitialisation",
            body: message,
            category: "ACTION" as const,
            employeeId: adminId,
            global: false,
            metadata: {
              employeeId: employee.id,
              identifier,
              requesterName: fullName,
              actionPath: "/dashboard/dsi/password-reset",
            },
          })),
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    logError("auth/forgot-password", e, "erreur serveur");
    return jsonServerError(e);
  }
}
