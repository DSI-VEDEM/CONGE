export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt, jsonError } from "@/lib/auth";
import { norm } from "@/lib/validators";
import { isLeaveType, isMenstrualLeaveType } from "@/lib/leave-types";
import type { LeaveType } from "@/generated/prisma/client";

function parseDate(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function GET(req: Request) {
  // Retourne les congés (tous ou uniquement les miens si ?mine=1).
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const employeeId = String(v.payload?.sub ?? "");
  if (!employeeId) return jsonError("Token invalide", 401);

  const url = new URL(req.url);
  const mine = url.searchParams.get("mine") === "1";

  const where = mine ? { employeeId } : undefined;

  const leaves = await prisma.leaveRequest.findMany({
    where,
    select: {
      id: true,
      type: true,
      startDate: true,
      endDate: true,
      reason: true,
      status: true,
      currentAssigneeId: true,
      currentAssignee: { select: { id: true, firstName: true, lastName: true, role: true } },
      employee: { select: { id: true, firstName: true, lastName: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ leaves });
}

export async function POST(req: Request) {
  // Création d'une demande de congé classique (pour le front général).
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const employeeId = String(v.payload?.sub ?? "");
  if (!employeeId) return jsonError("Token invalide", 401);

  const body = await req.json().catch(() => ({}));
  const type = norm(body?.type);
  const reason = norm(body?.reason) || null;
  const remainingTasks = norm(body?.remainingTasks) || null;
  const startDate = parseDate(body?.startDate);
  const endDate = parseDate(body?.endDate);
  const leaveType = isLeaveType(type) ? type : null;

  if (!leaveType || !startDate || !endDate) {
    return jsonError("Champs requis: type, startDate, endDate", 400);
  }

  if (startDate > endDate) {
    return jsonError("startDate doit être avant endDate", 400);
  }

  const actor = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { gender: true },
  });
  if (!actor) {
    return jsonError("Employé introuvable", 404);
  }
  if (isMenstrualLeaveType(leaveType) && actor.gender !== "FEMALE") {
    return jsonError("Congé menstruel réservé aux collaboratrices", 403);
  }

  // On cible un comptable actif pour valider ou mettre le congé en attente
  const accountant = await prisma.employee.findFirst({
    where: { role: "ACCOUNTANT", status: "ACTIVE" },
    select: { id: true },
  });

  // Si aucun comptable n'est actif, la demande est soumise directement (pas de validation intermédiaire)
  const status = accountant?.id ? "PENDING" : "SUBMITTED";

  const created = await prisma.leaveRequest.create({
    data: {
      employeeId,
      type: leaveType as LeaveType,
      startDate,
      endDate,
      reason,
      status,
      currentAssigneeId: accountant?.id ?? null,
    },
    select: {
      id: true,
      type: true,
      startDate: true,
      endDate: true,
      status: true,
      currentAssigneeId: true,
      createdAt: true,
    },
  });

  await prisma.leaveDecision.create({
    data: {
      leaveRequestId: created.id,
      actorId: employeeId,
      type: "SUBMIT",
      comment: remainingTasks || null,
    },
  });

  return NextResponse.json({ leave: created }, { status: 201 });
}
