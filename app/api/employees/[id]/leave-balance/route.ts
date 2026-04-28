export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { requireAuth } from "@/lib/leave-requests";
import { getLeaveCycleForDate, syncEmployeeLeaveBalance } from "@/lib/leave-balance";

type Ctx = { params: Promise<{ id: string }> };
type LeaveBalanceAction = "RESET" | "INCREASE" | "SET" | "SET_FIRST_YEAR_USED";

export async function POST(req: Request, ctx: Ctx) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const { role } = authRes.auth;
  const canManage = role === "CEO" || role === "ACCOUNTANT";
  if (!canManage) return jsonError("Accès refusé", 403);

  const { id } = await ctx.params;
  if (!id) return jsonError("ID requis", 400);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "") as LeaveBalanceAction;
  const rawAmount = body?.amount;
  const amount =
    typeof rawAmount === "string"
      ? Number(rawAmount.replace(",", ".").trim())
      : Number(rawAmount ?? 0);

  if (!action || !["RESET", "INCREASE", "SET", "SET_FIRST_YEAR_USED"].includes(action)) {
    return jsonError("Action invalide (RESET|INCREASE|SET|SET_FIRST_YEAR_USED)", 400);
  }

  if (role === "ACCOUNTANT" && action !== "SET_FIRST_YEAR_USED") {
    return jsonError("La comptable peut uniquement ajuster le solde de première année", 403);
  }

  if (action === "INCREASE" || action === "SET") {
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonError("Montant invalide", 400);
    }
  }
  if (action === "SET_FIRST_YEAR_USED") {
    if (!Number.isFinite(amount) || amount < 0) {
      return jsonError("Montant invalide", 400);
    }
    if (amount > 366) {
      return jsonError("Le nombre de jours semble trop élevé", 400);
    }
  }

  const target = await prisma.employee.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!target) return jsonError("Employé introuvable", 404);

  const updated = await prisma.$transaction(async (tx) => {
    const employee = await tx.employee.findUnique({
      where: { id },
      select: {
        id: true,
        leaveBalanceAdjustment: true,
        hireDate: true,
        companyEntryDate: true,
        createdAt: true,
      },
    });

    if (!employee) return null;

    const currentAdjustment = Number(employee.leaveBalanceAdjustment ?? 0);
    const nextAdjustment =
      action === "RESET"
        ? 0
        : action === "INCREASE"
          ? currentAdjustment + amount
          : action === "SET"
            ? amount
            : currentAdjustment;

    const currentCycle = getLeaveCycleForDate(employee, new Date());
    const currentCycleYear = currentCycle.start.getUTCFullYear();
    const updateData =
      action === "SET_FIRST_YEAR_USED"
        ? amount > 0
          ? { firstYearLeaveUsedDays: amount, firstYearLeaveUsedYear: currentCycleYear }
          : { firstYearLeaveUsedDays: 0, firstYearLeaveUsedYear: null }
        : { leaveBalanceAdjustment: nextAdjustment };

    await tx.employee.update({
      where: { id },
      data: updateData,
    });

    await syncEmployeeLeaveBalance(tx, id);

    return tx.employee.findUnique({
      where: { id },
      select: {
        id: true,
        leaveBalance: true,
        leaveBalanceAdjustment: true,
        firstYearLeaveUsedDays: true,
        firstYearLeaveUsedYear: true,
        hireDate: true,
      },
    });
  });

  if (!updated) return jsonError("Employé introuvable", 404);

  return NextResponse.json({ employee: updated });
}
