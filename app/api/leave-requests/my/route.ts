export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/leave-requests";
import {
  calculateEntitledLeaveDaysForYear,
  consumedLeaveDaysForYearFromLeaves,
  syncEmployeeLeaveBalance,
} from "@/lib/leave-balance";
import { expandRecurringAnchorToYear, normalizeUtcDateOnly, utcYearRange } from "@/lib/holidays";

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
  const { start: yearStart, endExclusive: yearEndExclusive } = utcYearRange(currentYear);
  const [oneOff, recurring] = await Promise.all([
    prisma.holiday
      .findMany({
        where: { isRecurring: { not: true }, date: { gte: yearStart, lt: yearEndExclusive } },
        select: { date: true },
      })
      .catch(() => []),
    prisma.holiday.findMany({ where: { isRecurring: true }, select: { date: true } }).catch(() => []),
  ]);
  const holidayDates = [
    ...oneOff.map((h) => normalizeUtcDateOnly(h.date)),
    ...recurring
      .map((h) => expandRecurringAnchorToYear(h.date, currentYear))
      .filter(Boolean)
      .map((d) => d as Date),
  ];
  const currentYearCalc = employee
    ? calculateEntitledLeaveDaysForYear(
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
        currentYear
      )
    : {
        entitlement: 0,
        monthlyAccrued: 0,
        bonusDays: 0,
        monthsWorkedThisYear: 0,
        seniorityYears: 0,
      };
  const firstYearUsedDaysCurrentYear =
    employee && employee.firstYearLeaveUsedYear === currentYear
      ? Math.max(0, Number(employee.firstYearLeaveUsedDays ?? 0))
      : 0;
  const consumedCurrentYear = consumedLeaveDaysForYearFromLeaves(
    leaves.map((leave) => ({
      startDate: leave.startDate,
      endDate: leave.endDate,
      status: leave.status,
      type: leave.type,
    })),
    currentYear,
    holidayDates,
    firstYearUsedDaysCurrentYear
  );
  const remainingCurrentYear = annualLeaveBalance - consumedCurrentYear;
  const nextYearLeaveBalance = employee
    ? calculateEntitledLeaveDaysForYear(
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
        currentYear + 1
      ).entitlement
    : 0;
  const alreadyBorrowed = Math.max(0, -remainingCurrentYear);
  const availableWithAdvance = Math.max(0, remainingCurrentYear + nextYearLeaveBalance);

  return NextResponse.json({
    leaves,
    employee,
    annualLeaveBalance,
    remainingCurrentYear,
    nextYearLeaveBalance,
    alreadyBorrowed,
    availableWithAdvance,
    firstYearLeaveUsedDays: firstYearUsedDaysCurrentYear,
    firstYearLeaveUsedYear: employee?.firstYearLeaveUsedYear ?? null,
    seniorityYears: currentYearCalc.seniorityYears,
    seniorityBonusDays: currentYearCalc.bonusDays,
    monthlyAccruedDays: currentYearCalc.monthlyAccrued,
  });
}
