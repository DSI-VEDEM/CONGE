export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt, jsonError } from "@/lib/auth";
import { norm } from "@/lib/validators";
import { isAnticipatedPaidLeaveType, isLeaveType, isMenstrualLeaveType, isPaidLeaveType } from "@/lib/leave-types";
import type { LeaveType } from "@/generated/prisma/client";
import {
  calculateEntitledLeaveDaysForCycle,
  consumedLeaveDaysForRange,
  debtCarriedIntoCycle,
  getLeaveCycleForDate,
  requestedLeaveDaysForType,
  syncEmployeeLeaveBalance,
} from "@/lib/leave-balance";
import { expandRecurringAnchorsBetweenInclusive, normalizeUtcDateOnly } from "@/lib/holidays";

function parseDate(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatDateForMessage(value: Date | null | undefined) {
  if (!value) return "";
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${value.getUTCFullYear()}`;
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

  const synced = await syncEmployeeLeaveBalance(prisma, employeeId);
  if (!synced) {
    return jsonError("Employé introuvable", 404);
  }
  const actor = synced.employee;
  if (isMenstrualLeaveType(leaveType) && actor.gender !== "FEMALE") {
    return jsonError("Congé menstruel réservé aux collaboratrices", 403);
  }

  const [oneOffHolidays, recurringHolidays] = await Promise.all([
    prisma.holiday
      .findMany({
        where: { isRecurring: { not: true }, date: { gte: startDate, lte: endDate } },
        select: { date: true },
      })
      .catch(() => []),
    prisma.holiday
      .findMany({
        where: { isRecurring: true },
        select: { date: true },
      })
      .catch(() => []),
  ]);
  const holidayDates = [
    ...oneOffHolidays.map((h) => normalizeUtcDateOnly(h.date)),
    ...expandRecurringAnchorsBetweenInclusive(
      recurringHolidays.map((h) => h.date),
      startDate,
      endDate
    ),
  ];
  const requested = requestedLeaveDaysForType(startDate, endDate, leaveType, holidayDates);
  if (isPaidLeaveType(leaveType)) {
    const leaveCycle = getLeaveCycleForDate(actor, startDate);
    if (!leaveCycle.isPaidLeaveEligible) {
      return jsonError(
        `Vous aurez droit aux congés payés à partir du ${formatDateForMessage(leaveCycle.eligibilityDate)}`,
        403,
        {
          paidLeaveEligible: false,
          paidLeaveEligibilityDate: leaveCycle.eligibilityDate,
        }
      );
    }

    const cycleCalc = calculateEntitledLeaveDaysForCycle(actor, startDate);
    const debtFromPreviousCycle = await debtCarriedIntoCycle(prisma, actor, employeeId, leaveCycle.start);
    const currentEntitlement = Math.max(0, cycleCalc.entitlement - debtFromPreviousCycle);
    const consumed = await consumedLeaveDaysForRange(prisma, employeeId, leaveCycle.start, leaveCycle.endExclusive);
    const nextCycleEntitlement = calculateEntitledLeaveDaysForCycle(actor, leaveCycle.endExclusive).entitlement;
    const availableCurrentCycle = Math.max(0, currentEntitlement - consumed);
    const alreadyBorrowed = Math.max(0, consumed - currentEntitlement);
    const availableAnticipated = Math.max(0, nextCycleEntitlement - alreadyBorrowed);

    if (isAnticipatedPaidLeaveType(leaveType)) {
      if (availableCurrentCycle > 0) {
        return jsonError("Le congé anticipé est disponible uniquement quand le congé payé est épuisé", 409, {
          availableCurrentYear: availableCurrentCycle,
          requested,
        });
      }
      if (requested > availableAnticipated) {
        return jsonError("La demande dépasse votre avance de congés disponible", 409, {
          available: availableAnticipated,
          requested,
        });
      }
    } else if (requested > availableCurrentCycle) {
      return jsonError("La demande dépasse votre solde de congés payés", 409, {
        available: availableCurrentCycle,
        requested,
      });
    }
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
