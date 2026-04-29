export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/leave-requests";
import {
  calculateEntitledLeaveDaysForCycle,
  consumedLeaveDaysForRangeFromLeaves,
  firstYearLeaveUsedDaysForCycle,
  syncEmployeeLeaveBalance,
} from "@/lib/leave-balance";
import { expandRecurringAnchorsBetweenInclusive, normalizeUtcDateOnly } from "@/lib/holidays";

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
        firstYearLeaveUsedDays: true,
        firstYearLeaveUsedYear: true,
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
        justificationFileName: true,
        justificationMimeType: true,
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
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentCycleCalc = employee
    ? calculateEntitledLeaveDaysForCycle(
        {
          id: employee.id,
          leaveBalance: Number(employee.leaveBalance ?? 0),
          leaveBalanceAdjustment: Number(employee.leaveBalanceAdjustment ?? 0),
          firstYearLeaveUsedDays: Number(employee.firstYearLeaveUsedDays ?? 0),
          firstYearLeaveUsedYear: employee.firstYearLeaveUsedYear ?? null,
          hireDate: employee.hireDate ?? null,
          companyEntryDate: employee.companyEntryDate ?? null,
          createdAt: employee.createdAt,
        },
        now
      )
    : {
        entitlement: 0,
        monthlyAccrued: 0,
        bonusDays: 0,
        monthsWorkedThisYear: 0,
        seniorityYears: 0,
        leaveCycleStart: new Date(Date.UTC(currentYear, 0, 1)),
        leaveCycleEndExclusive: new Date(Date.UTC(currentYear + 1, 0, 1)),
        leaveCycleEndInclusive: new Date(Date.UTC(currentYear, 11, 31)),
        paidLeaveEligibilityDate: null,
        isPaidLeaveEligible: false,
      };
  const [oneOff, recurring] = await Promise.all([
    prisma.holiday
      .findMany({
        where: {
          isRecurring: { not: true },
          date: { gte: currentCycleCalc.leaveCycleStart, lt: currentCycleCalc.leaveCycleEndExclusive },
        },
        select: { date: true },
      })
      .catch(() => []),
    prisma.holiday.findMany({ where: { isRecurring: true }, select: { date: true } }).catch(() => []),
  ]);
  const holidayDates = [
    ...oneOff.map((h) => normalizeUtcDateOnly(h.date)),
    ...expandRecurringAnchorsBetweenInclusive(
      recurring.map((h) => h.date),
      currentCycleCalc.leaveCycleStart,
      currentCycleCalc.leaveCycleEndInclusive
    ),
  ];
  const firstYearUsedDaysCurrentCycle = employee
    ? firstYearLeaveUsedDaysForCycle(
        employee,
        currentCycleCalc.leaveCycleStart,
        currentCycleCalc.leaveCycleEndExclusive
      )
    : 0;
  const consumedCurrentYear = consumedLeaveDaysForRangeFromLeaves(
    leaves.map((leave) => ({
      startDate: leave.startDate,
      endDate: leave.endDate,
      status: leave.status,
      type: leave.type,
    })),
    currentCycleCalc.leaveCycleStart,
    currentCycleCalc.leaveCycleEndExclusive,
    holidayDates,
    firstYearUsedDaysCurrentCycle
  );
  const remainingCurrentYear = annualLeaveBalance - consumedCurrentYear;
  const nextYearLeaveBalance =
    employee && currentCycleCalc.isPaidLeaveEligible
      ? calculateEntitledLeaveDaysForCycle(
        {
          id: employee.id,
          leaveBalance: Number(employee.leaveBalance ?? 0),
          leaveBalanceAdjustment: Number(employee.leaveBalanceAdjustment ?? 0),
          firstYearLeaveUsedDays: Number(employee.firstYearLeaveUsedDays ?? 0),
          firstYearLeaveUsedYear: employee.firstYearLeaveUsedYear ?? null,
          hireDate: employee.hireDate ?? null,
          companyEntryDate: employee.companyEntryDate ?? null,
          createdAt: employee.createdAt,
        },
        currentCycleCalc.leaveCycleEndExclusive
      ).entitlement
      : 0;
  const alreadyBorrowed = Math.max(0, -remainingCurrentYear);
  const availableWithAdvance = currentCycleCalc.isPaidLeaveEligible
    ? Math.max(0, remainingCurrentYear + nextYearLeaveBalance)
    : 0;

  return NextResponse.json({
    leaves,
    employee,
    annualLeaveBalance,
    remainingCurrentYear,
    nextYearLeaveBalance,
    alreadyBorrowed,
    availableWithAdvance,
    firstYearLeaveUsedDays: firstYearUsedDaysCurrentCycle,
    firstYearLeaveUsedYear: employee?.firstYearLeaveUsedYear ?? null,
    seniorityYears: currentCycleCalc.seniorityYears,
    seniorityBonusDays: currentCycleCalc.bonusDays,
    monthlyAccruedDays: currentCycleCalc.monthlyAccrued,
    paidLeaveEligible: currentCycleCalc.isPaidLeaveEligible,
    paidLeaveEligibilityDate: currentCycleCalc.paidLeaveEligibilityDate,
    leaveCycleStart: currentCycleCalc.leaveCycleStart,
    leaveCycleEnd: currentCycleCalc.leaveCycleEndInclusive,
  });
}
