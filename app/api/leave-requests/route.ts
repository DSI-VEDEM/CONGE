export const runtime = "nodejs";

/// Traitement principal pour POST /api/leave-requests :
/// 1. vérifie le JWT, la disponibilité des rôles et l'existence d'un assigné actif.
/// 2. calcule les soldes (annualisé, avances) pour bloquer les dépassements.
/// 3. vérifie les blackouts actifs avant de créer la demande et les décisions Flood.
/// 4. retourne l'enregistrement résumant l'état des congés.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import {
  parseDate,
  requireAuth,
  findActiveEmployeeByRole,
  notifyAccountantOfLeaveRequest,
  notifyCeoOfDirectorLeaveRequest,
} from "@/lib/leave-requests";
import { norm } from "@/lib/validators";
import {
  calculateEntitledLeaveDaysForYear,
  consumedLeaveDaysForYear,
  requestedLeaveDaysForType,
  syncEmployeeLeaveBalance,
} from "@/lib/leave-balance";
import { isLeaveType, isMenstrualLeaveType } from "@/lib/leave-types";
import type { LeaveType } from "@/generated/prisma/client";

/// Vérifie si la compilation Prisma inclut le champ `employeeIds` pour les blackouts (selon la version du schéma).
function supportsLeaveBlackoutEmployeeIds() {
  const client = prisma as unknown as {
    _runtimeDataModel?: {
      models?: Record<string, { fields?: Array<{ name?: string }> }>;
    };
  };
  const fields = client._runtimeDataModel?.models?.LeaveBlackout?.fields;
  if (!Array.isArray(fields)) return false;
  return fields.some((f: { name?: string }) => f?.name === "employeeIds");
}

/// Retourne true si un blackout s'applique au collaborateur (par ID ou département).
function appliesToEmployee(
  blackout: { departmentId?: string | null; employeeIds?: string[] | null },
  employee: { id: string; departmentId?: string | null }
) {
  const targetIds = Array.isArray(blackout.employeeIds) ? blackout.employeeIds : [];
  if (targetIds.includes(employee.id)) return true;
  if (blackout.departmentId && employee.departmentId && blackout.departmentId === employee.departmentId) return true;
  return !blackout.departmentId && targetIds.length === 0;
}

export async function POST(req: Request) {
  /// Endpoint de soumission de congés avec logique d'escalade automatique.
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role, departmentId } = authRes.auth;

  // Le CEO ne crée pas de demande : il valide en bout de chaîne seulement.
  if (role === "CEO") {
    return jsonError("Le PDG ne peut pas créer de demande", 403);
  }

  const body = await req.json().catch(() => ({}));
  const type = norm(body?.type);
  const reason = norm(body?.reason) || null;
  const startDate = parseDate(body?.startDate);
  const endDate = parseDate(body?.endDate);
  const leaveType = isLeaveType(type) ? type : null;

  // On exige type/start/end.
  if (!leaveType || !startDate || !endDate) {
    return jsonError("Champs requis: type, startDate, endDate", 400);
  }

  // startDate doit précéder endDate pour éviter les plages négatives.
  if (startDate > endDate) {
    return jsonError("startDate doit être avant endDate", 400);
  }

  // Synchronise les soldes avant toute validation (mise à jour `leaveBalance` en base).
  const synced = await syncEmployeeLeaveBalance(prisma, actorId);
  if (!synced) return jsonError("Employé introuvable", 404);
  const employee = synced.employee;
  const actorProfile = await prisma.employee.findUnique({
    where: { id: actorId },
    select: { firstName: true, lastName: true },
  });
  // Vérifie que seuls les profils féminins peuvent demander un congé menstruel.
  if (isMenstrualLeaveType(leaveType) && employee.gender !== "FEMALE") {
    return jsonError("Congé menstruel réservé aux collaboratrices", 403);
  }

  // On travaille sur l'année en cours pour le calcul des droits.
  const currentYear = new Date().getUTCFullYear();
  const requested = requestedLeaveDaysForType(startDate, endDate, leaveType);
  if (leaveType === "ANNUAL_PAID") {
    const consumed = await consumedLeaveDaysForYear(prisma, actorId, currentYear);
    const nextYearEntitlement = calculateEntitledLeaveDaysForYear(
      {
        id: employee.id,
        leaveBalance: Number(employee.leaveBalance ?? 0),
        leaveBalanceAdjustment: Number(employee.leaveBalanceAdjustment ?? 0),
        hireDate: employee.hireDate ?? null,
        companyEntryDate: employee.companyEntryDate ?? null,
        createdAt: employee.createdAt,
      },
      currentYear + 1
    ).entitlement;
    const availableCurrentYear = Math.max(0, Number(employee.leaveBalance ?? 0) - consumed);
    // Solde disponible = reste current year + avance potentielle sur l'année suivante.
    const available = Math.max(0, availableCurrentYear + nextYearEntitlement);
    if (requested > available) {
      return jsonError("La demande dépasse votre solde de congés disponible", 409, {
        available,
        availableCurrentYear,
        nextYearAdvance: nextYearEntitlement,
        requested,
        consumed,
        entitlement: employee.leaveBalance,
      });
    }
  }

  const supportsEmployeeIds = supportsLeaveBlackoutEmployeeIds();
  // Recherche des blackouts qui chevauchent la demande.
  const overlappingBlackouts = await prisma.leaveBlackout.findMany({
    where: {
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: {
      id: true,
      departmentId: true,
      ...(supportsEmployeeIds ? { employeeIds: true } : {}),
    },
  });
  const hasBlockedRange = overlappingBlackouts.some((b) =>
    appliesToEmployee(b, { id: actorId, departmentId })
  );
  if (hasBlockedRange) {
    return jsonError("Période bloquée par la direction", 409);
  }

  let assignee = null;
  let autoCeo = null;
  let reachedCeoAt: Date | null = null;
  if (role === "EMPLOYEE") {
    assignee = await findActiveEmployeeByRole("ACCOUNTANT");
  } else if (role === "DEPT_HEAD" || role === "SERVICE_HEAD") {
    assignee = await findActiveEmployeeByRole("ACCOUNTANT");
    autoCeo = await findActiveEmployeeByRole("CEO");
    if (autoCeo) reachedCeoAt = new Date();
  } else if (role === "ACCOUNTANT") {
    assignee = await findActiveEmployeeByRole("CEO");
  }

  // Sans assigné, impossible d'avancer la demande.
  if (!assignee) {
    return jsonError("Aucun assignataire actif disponible", 409);
  }

  const created = await prisma.leaveRequest.create({
    data: {
      employeeId: actorId,
    type: leaveType as LeaveType,
      startDate,
      endDate,
      reason,
      status: "PENDING",
      currentAssigneeId: assignee.id,
      deptHeadAssignedAt: assignee.role === "DEPT_HEAD" || assignee.role === "SERVICE_HEAD" ? new Date() : null,
      reachedCeoAt: assignee.role === "CEO" ? new Date() : reachedCeoAt,
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

  // Historise l'action de soumission
  await prisma.leaveDecision.create({
    data: {
      leaveRequestId: created.id,
      actorId,
      type: "SUBMIT",
    },
  });

  const actorName =
    [actorProfile?.firstName, actorProfile?.lastName].filter(Boolean).join(" ") || "Un collaborateur";
  await notifyAccountantOfLeaveRequest({
    leaveRequestId: created.id,
    employeeName: actorName,
    actorRole: role,
    startDate,
    endDate,
  });
  await notifyCeoOfDirectorLeaveRequest({
    leaveRequestId: created.id,
    employeeName: actorName,
    actorRole: role,
    startDate,
    endDate,
  });

  if (autoCeo) {
    await prisma.leaveDecision.create({
      data: {
        leaveRequestId: created.id,
        actorId,
        type: "ESCALATE",
        toEmployeeId: autoCeo.id,
        comment: "Auto-escalation PDG (DEPT_HEAD/SERVICE_HEAD).",
      },
    });
  }

  return NextResponse.json({ leave: created }, { status: 201 });
}
