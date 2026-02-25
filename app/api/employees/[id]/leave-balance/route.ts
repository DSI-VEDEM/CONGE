export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { requireAuth } from "@/lib/leave-requests";
import { syncEmployeeLeaveBalance } from "@/lib/leave-balance";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const { role } = authRes.auth;
  if (role !== "CEO") return jsonError("Accès refusé", 403);

  const { id } = await ctx.params;
  if (!id) return jsonError("ID requis", 400);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  const rawAmount = body?.amount;
  const amount =
    typeof rawAmount === "string"
      ? Number(rawAmount.replace(",", ".").trim())
      : Number(rawAmount ?? 0);

  if (!action || !["RESET", "INCREASE", "SET"].includes(action)) {
    return jsonError("Action invalide (RESET|INCREASE|SET)", 400);
  }

  if (action === "INCREASE" || action === "SET") {
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonError("Montant invalide", 400);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const employee = await tx.employee.findUnique({
      where: { id },
      select: { id: true, leaveBalanceAdjustment: true },
    });

    if (!employee) return null;

    const currentAdjustment = Number(employee.leaveBalanceAdjustment ?? 0);
    const nextAdjustment =
      action === "RESET" ? 0 : action === "INCREASE" ? currentAdjustment + amount : amount;

    await tx.employee.update({
      where: { id },
      data: { leaveBalanceAdjustment: nextAdjustment },
    });

    await syncEmployeeLeaveBalance(tx, id);

    return tx.employee.findUnique({
      where: { id },
      select: { id: true, leaveBalance: true, leaveBalanceAdjustment: true, hireDate: true },
    });
  });

  if (!updated) return jsonError("Employé introuvable", 404);

  return NextResponse.json({ employee: updated });
}
