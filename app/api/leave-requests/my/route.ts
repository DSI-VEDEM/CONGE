export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/leave-requests";
import {
  calculateEntitledLeaveDaysForYear,
  consumedLeaveDaysForYearFromLeaves,
  syncEmployeeLeaveBalance,
} from "@/lib/leave-balance";

export async function GET(req: Request) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId } = authRes.auth;
  await syncEmployeeLeaveBalance(prisma, actorId);

  const [employee, leaves] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: actorId },
      select: {
        id: true,
        leaveBalance: true,
        leaveBalanceAdjustment: true,
        hireDate: true,
        companyEntryDate: true,
        createdAt: true,
      },
    }),
    prisma.leaveRequest.findMany({
      where: { employeeId: actorId },
      select: {
        id: true,
        type: true,
        startDate: true,
        endDate: true,
        reason: true,
        status: true,
        currentAssigneeId: true,
        currentAssignee: { select: { firstName: true, lastName: true } },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const annualLeaveBalance = Number(employee?.leaveBalance ?? 0);
  const currentYear = new Date().getUTCFullYear();
  const currentYearCalc = employee
    ? calculateEntitledLeaveDaysForYear(
        {
          id: employee.id,
          leaveBalance: Number(employee.leaveBalance ?? 0),
          leaveBalanceAdjustment: Number(employee.leaveBalanceAdjustment ?? 0),
          hireDate: employee.hireDate ?? null,
          companyEntryDate: employee.companyEntryDate ?? null,
          createdAt: employee.createdAt,
        },
        currentYear
      )
    : {
        entitlement: 0,
        monthlyAccrued: 0,
        bonusDays: 0,
        monthsWorkedThisYear: 0,
        seniorityYears: 0,
      };
  const consumedCurrentYear = consumedLeaveDaysForYearFromLeaves(
    leaves.map((leave) => ({
      startDate: leave.startDate,
      endDate: leave.endDate,
      status: leave.status,
      type: leave.type,
    })),
    currentYear
  );
  const remainingCurrentYear = Math.max(0, annualLeaveBalance - consumedCurrentYear);
  const nextYearLeaveBalance = employee
    ? calculateEntitledLeaveDaysForYear(
        {
          id: employee.id,
          leaveBalance: Number(employee.leaveBalance ?? 0),
          leaveBalanceAdjustment: Number(employee.leaveBalanceAdjustment ?? 0),
          hireDate: employee.hireDate ?? null,
          companyEntryDate: employee.companyEntryDate ?? null,
          createdAt: employee.createdAt,
        },
        currentYear + 1
      ).entitlement
    : 0;
  const availableWithAdvance = remainingCurrentYear + nextYearLeaveBalance;

  return NextResponse.json({
    leaves,
    employee,
    annualLeaveBalance,
    remainingCurrentYear,
    nextYearLeaveBalance,
    availableWithAdvance,
    seniorityYears: currentYearCalc.seniorityYears,
    seniorityBonusDays: currentYearCalc.bonusDays,
    monthlyAccruedDays: currentYearCalc.monthlyAccrued,
  });
}
