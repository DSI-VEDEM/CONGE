export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, verifyJwt } from "@/lib/auth";
import { norm } from "@/lib/validators";
import { findActiveEmployeeByRole } from "@/lib/leave-requests";
import type { NotificationCategory } from "@/generated/prisma/client";

function authFromRequest(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return { ok: false as const, error: v.error };

  const id = String(v.payload?.sub ?? "");
  const role = String(v.payload?.role ?? "");
  if (!id || !role) return { ok: false as const, error: jsonError("Token invalide", 401) };

  return { ok: true as const, auth: { id, role } };
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authRes = authFromRequest(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role } = authRes.auth;
  if (role !== "CEO") return jsonError("Seul le PDG peut refuser un bulletin", 403);

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const comment = norm(body?.comment);
  if (!comment || comment.length < 3) {
    return jsonError("Veuillez laisser un message (au moins 3 caractères)", 400);
  }

  const slip = await prisma.salarySlip.findUnique({
    where: { id },
    select: {
      id: true,
      employeeId: true,
      year: true,
      month: true,
      fileName: true,
      signedAt: true,
      uploadedById: true,
      employee: { select: { firstName: true, lastName: true, matricule: true, email: true } },
      uploadedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
    },
  });

  if (!slip) return jsonError("Bulletin introuvable", 404);
  if (slip.signedAt) return jsonError("Impossible de refuser un bulletin déjà signé", 409);

  // Only delete non-signed slips.
  await prisma.salarySlip.delete({ where: { id } });

  // Notify accountant (and fallback to uploader if needed).
  const accountant = await findActiveEmployeeByRole("ACCOUNTANT");
  const recipientId = accountant?.id ?? slip.uploadedById;

  const monthLabel = String(slip.month).padStart(2, "0");
  const ownerParts = [slip.employee?.firstName, slip.employee?.lastName].filter(Boolean);
  const ownerLabel = ownerParts.length ? ownerParts.join(" ").trim() : slip.employee?.matricule ?? slip.employee?.email ?? "Employé";
  const fileLabel = slip.fileName ? `Fichier: ${slip.fileName}` : "";

  await prisma.notification.create({
    data: {
      title: "Bulletin refusé par le PDG",
      body: `Le PDG a refusé le bulletin de ${ownerLabel} (${monthLabel}/${slip.year}).\n\nMotif: ${comment}\n${fileLabel}`,
      category: "ALERT" as NotificationCategory,
      employeeId: recipientId,
      targetRole: "ACCOUNTANT",
      global: false,
      metadata: {
        rejectedSalarySlip: {
          employeeId: slip.employeeId,
          year: slip.year,
          month: slip.month,
          fileName: slip.fileName,
          comment,
        },
        actionPath: "/dashboard/accountant/payslips/imported",
        actionLabel: "Ré-importer un bulletin",
      },
    },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}

